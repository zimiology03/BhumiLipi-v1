"""Email/phone password authentication with one-time verification codes."""

import base64
from contextlib import contextmanager
import hashlib
import hmac
import json
import os
import re
import secrets
import smtplib
import sqlite3
import time
import urllib.parse
import urllib.request
import uuid
from email.message import EmailMessage
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field


router = APIRouter(prefix="/auth", tags=["account"])
OTP_LIFETIME_SECONDS = 600
OTP_RESEND_SECONDS = 60
OTP_MAX_ATTEMPTS = 5
TOKEN_LIFETIME_SECONDS = 8 * 60 * 60


class CredentialRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    first_name: str = Field(default="", max_length=100)
    middle_name: str = Field(default="", max_length=100)
    last_name: str = Field(default="", max_length=100)


class OTPRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=254)
    code: str = Field(min_length=6, max_length=6)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class ContactChangeRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=254)
    current_password: str = Field(min_length=8, max_length=128)


class ContactVerifyRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=254)
    code: str = Field(min_length=6, max_length=6)


class AccountDeleteRequest(BaseModel):
    password: str = Field(min_length=8, max_length=128)


def _database_path() -> Path:
    configured = os.getenv("BHUMILIPI_AUTH_DB")
    if not configured:
        local_data = os.getenv("LOCALAPPDATA") or os.getenv("XDG_DATA_HOME")
        base = Path(local_data) if local_data else Path.home() / ".local" / "share"
        return base / "BhumiLipi" / "auth.db"
    path = Path(configured)
    return path if path.is_absolute() else Path(__file__).parent / path


def _connect() -> sqlite3.Connection:
    path = _database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=15)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


@contextmanager
def _connection():
    connection = _connect()
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def _add_missing_column(db: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    existing = {row["name"] for row in db.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in existing:
        db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_auth_db() -> None:
    with _connection() as db:
        db.execute("PRAGMA journal_mode = WAL")
        db.execute("""CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            identifier TEXT NOT NULL UNIQUE,
            method TEXT NOT NULL CHECK (method IN ('email', 'phone')),
            password_hash TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            verified_at INTEGER NOT NULL
        )""")
        _add_missing_column(db, "users", "first_name", "TEXT NOT NULL DEFAULT ''")
        _add_missing_column(db, "users", "middle_name", "TEXT NOT NULL DEFAULT ''")
        _add_missing_column(db, "users", "last_name", "TEXT NOT NULL DEFAULT ''")
        _add_missing_column(db, "users", "token_version", "INTEGER NOT NULL DEFAULT 0")
        db.execute("""CREATE TABLE IF NOT EXISTS auth_challenges (
            identifier TEXT PRIMARY KEY,
            purpose TEXT NOT NULL CHECK (purpose IN ('register', 'login')),
            method TEXT NOT NULL CHECK (method IN ('email', 'phone')),
            password_hash TEXT,
            otp_hash TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            resend_at INTEGER NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0
        )""")
        _add_missing_column(db, "auth_challenges", "first_name", "TEXT NOT NULL DEFAULT ''")
        _add_missing_column(db, "auth_challenges", "middle_name", "TEXT NOT NULL DEFAULT ''")
        _add_missing_column(db, "auth_challenges", "last_name", "TEXT NOT NULL DEFAULT ''")
        db.execute("""CREATE TABLE IF NOT EXISTS auth_send_limits (
            client_ip TEXT PRIMARY KEY,
            window_start INTEGER NOT NULL,
            requests INTEGER NOT NULL
        )""")
        db.execute("""CREATE TABLE IF NOT EXISTS revoked_tokens (
            token_id TEXT PRIMARY KEY,
            expires_at INTEGER NOT NULL
        )""")
        db.execute("""CREATE TABLE IF NOT EXISTS contact_update_challenges (
            user_id TEXT PRIMARY KEY,
            identifier TEXT NOT NULL UNIQUE,
            method TEXT NOT NULL CHECK (method IN ('email', 'phone')),
            otp_hash TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            resend_at INTEGER NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0
        )""")


def _auth_secret() -> bytes:
    secret = os.getenv("AUTH_SECRET_KEY", "").strip()
    if len(secret) < 32 or secret.lower().startswith("replace_"):
        raise HTTPException(
            status_code=503,
            detail="Account sign-in is not configured. Set a private AUTH_SECRET_KEY in backend/.env.",
        )
    return secret.encode("utf-8")


def _normalize_identifier(raw: str) -> tuple[str, str]:
    value = raw.strip()
    if "@" in value:
        value = value.lower()
        if len(value) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise HTTPException(status_code=422, detail="Enter a valid email address or phone number.")
        return value, "email"

    compact = re.sub(r"[\s()\-.]", "", value)
    if compact.startswith("01") and len(compact) == 11 and compact.isdigit():
        compact = "+880" + compact[1:]
    elif compact.startswith("880") and compact[3:].isdigit():
        compact = "+" + compact
    if not re.fullmatch(r"\+[1-9]\d{7,14}", compact):
        raise HTTPException(status_code=422, detail="Use an email or a phone number with country code, such as +8801XXXXXXXXX.")
    return compact, "phone"


def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return "scrypt$" + base64.urlsafe_b64encode(salt).decode() + "$" + base64.urlsafe_b64encode(digest).decode()


def _password_matches(password: str, saved_hash: str) -> bool:
    try:
        algorithm, salt_text, digest_text = saved_hash.split("$", 2)
        if algorithm != "scrypt":
            return False
        salt = base64.urlsafe_b64decode(salt_text.encode())
        expected = base64.urlsafe_b64decode(digest_text.encode())
        actual = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=len(expected))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def _otp_digest(secret: bytes, identifier: str, purpose: str, code: str) -> str:
    message = f"{identifier}:{purpose}:{code}".encode("utf-8")
    return hmac.new(secret, message, hashlib.sha256).hexdigest()


def _send_email_otp(identifier: str, code: str) -> None:
    host = os.getenv("SMTP_HOST", "").strip()
    sender = os.getenv("SMTP_FROM_EMAIL", "").strip()
    username = os.getenv("SMTP_USER", "").strip()
    password = os.getenv("SMTP_PASSWORD", "")
    if not host or not sender:
        raise HTTPException(status_code=503, detail="Email OTP is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL in backend/.env.")

    message = EmailMessage()
    message["Subject"] = "Your BhumiLipi verification code"
    message["From"] = sender
    message["To"] = identifier
    message.set_content(
        f"Your BhumiLipi verification code is {code}. It expires in 10 minutes. "
        "If you did not request this code, you can ignore this message."
    )
    try:
        port = int(os.getenv("SMTP_PORT", "587"))
        timeout = 15
        if os.getenv("SMTP_USE_SSL", "false").lower() == "true":
            with smtplib.SMTP_SSL(host, port, timeout=timeout) as client:
                if username:
                    client.login(username, password)
                client.send_message(message)
        else:
            with smtplib.SMTP(host, port, timeout=timeout) as client:
                client.starttls()
                if username:
                    client.login(username, password)
                client.send_message(message)
    except Exception as exc:
        print(f"Email OTP delivery failed: {type(exc).__name__}")
        raise HTTPException(status_code=502, detail="We could not send the verification email. Check the SMTP settings and try again.") from exc


def _send_phone_otp(identifier: str, code: str) -> None:
    sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    token = os.getenv("TWILIO_AUTH_TOKEN", "")
    sender = os.getenv("TWILIO_FROM_NUMBER", "").strip()
    if not sid or not token or not sender:
        raise HTTPException(status_code=503, detail="Phone OTP is not configured. Set the Twilio credentials in backend/.env.")

    url = f"https://api.twilio.com/2010-04-01/Accounts/{urllib.parse.quote(sid, safe='')}/Messages.json"
    body = urllib.parse.urlencode({
        "To": identifier,
        "From": sender,
        "Body": f"Your BhumiLipi verification code is {code}. It expires in 10 minutes.",
    }).encode("utf-8")
    authorization = base64.b64encode(f"{sid}:{token}".encode("utf-8")).decode("ascii")
    request = urllib.request.Request(url, data=body, headers={
        "Authorization": f"Basic {authorization}",
        "Content-Type": "application/x-www-form-urlencoded",
    })
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            if response.status >= 300:
                raise RuntimeError("SMS provider rejected the request")
    except Exception as exc:
        print(f"SMS OTP delivery failed: {type(exc).__name__}")
        raise HTTPException(status_code=502, detail="We could not send the SMS code. Check the Twilio settings and phone number.") from exc


def _deliver_otp(identifier: str, method: str, code: str) -> None:
    if method == "email":
        _send_email_otp(identifier, code)
    else:
        _send_phone_otp(identifier, code)


def _check_send_rate_limit(client_ip: str) -> None:
    now = int(time.time())
    with _connection() as db:
        row = db.execute("SELECT window_start, requests FROM auth_send_limits WHERE client_ip = ?", (client_ip,)).fetchone()
        if not row or now - row["window_start"] >= 3600:
            db.execute("INSERT INTO auth_send_limits (client_ip, window_start, requests) VALUES (?, ?, 1) ON CONFLICT(client_ip) DO UPDATE SET window_start = excluded.window_start, requests = 1", (client_ip, now))
            return
        if row["requests"] >= 10:
            raise HTTPException(status_code=429, detail="Too many verification requests. Try again in about an hour.")
        db.execute("UPDATE auth_send_limits SET requests = requests + 1 WHERE client_ip = ?", (client_ip,))


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _create_access_token(user: sqlite3.Row) -> str:
    secret = _auth_secret()
    now = int(time.time())
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = _b64url(json.dumps({
        "sub": user["id"],
        "identifier": user["identifier"],
        "method": user["method"],
        "first_name": user["first_name"],
        "middle_name": user["middle_name"],
        "last_name": user["last_name"],
        "ver": user["token_version"],
        "jti": secrets.token_urlsafe(18),
        "iat": now,
        "exp": now + TOKEN_LIFETIME_SECONDS,
    }, separators=(",", ":")).encode())
    signature = _b64url(hmac.new(secret, f"{header}.{payload}".encode(), hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"


def _decode_access_token(token: str) -> dict:
    try:
        header, payload, signature = token.split(".")
        secret = _auth_secret()
        expected = _b64url(hmac.new(secret, f"{header}.{payload}".encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            raise ValueError("bad signature")
        decoded = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        if decoded.get("exp", 0) < int(time.time()):
            raise ValueError("expired")
        return decoded
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Your sign-in has expired. Please sign in again.") from exc


def current_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Please sign in to continue.")
    claims = _decode_access_token(authorization.removeprefix("Bearer ").strip())
    with _connection() as db:
        user = db.execute(
            "SELECT id, identifier, method, first_name, middle_name, last_name, token_version FROM users WHERE id = ?",
            (claims.get("sub"),),
        ).fetchone()
        revoked = db.execute("SELECT 1 FROM revoked_tokens WHERE token_id = ?", (claims.get("jti"),)).fetchone()
    if revoked:
        raise HTTPException(status_code=401, detail="You have signed out. Please sign in again.")
    if not user:
        raise HTTPException(status_code=401, detail="This account is no longer available. Please sign in again.")
    if claims.get("ver", 0) != user["token_version"]:
        raise HTTPException(status_code=401, detail="Your account security settings changed. Please sign in again.")
    return dict(user)


def _issue_login_result(identifier: str) -> dict:
    with _connection() as db:
        user = db.execute("SELECT * FROM users WHERE identifier = ?", (identifier,)).fetchone()
    if not user:
        raise HTTPException(status_code=400, detail="Account verification could not be completed. Start again.")
    return {
        "access_token": _create_access_token(user),
        "token_type": "bearer",
        "expires_in": TOKEN_LIFETIME_SECONDS,
        "user": {
            "user_id": user["id"],
            "identifier": user["identifier"],
            "method": user["method"],
            "first_name": user["first_name"],
            "middle_name": user["middle_name"],
            "last_name": user["last_name"],
        },
    }


def _request_otp(payload: CredentialRequest, purpose: str) -> dict:
    secret = _auth_secret()
    identifier, method = _normalize_identifier(payload.identifier)
    first_name = payload.first_name.strip()
    middle_name = payload.middle_name.strip()
    last_name = payload.last_name.strip()
    if purpose == "register" and (not first_name or not last_name):
        raise HTTPException(status_code=422, detail="First name and last name are required.")
    with _connection() as db:
        user = db.execute("SELECT * FROM users WHERE identifier = ?", (identifier,)).fetchone()
        if purpose == "register" and user:
            raise HTTPException(status_code=409, detail="An account already uses this email or phone. Sign in instead.")
        if purpose == "login" and (not user or not _password_matches(payload.password, user["password_hash"])):
            raise HTTPException(status_code=401, detail="Email/phone or password is incorrect.")
        challenge = db.execute("SELECT resend_at FROM auth_challenges WHERE identifier = ?", (identifier,)).fetchone()
        now = int(time.time())
        if challenge and challenge["resend_at"] > now:
            wait = challenge["resend_at"] - now
            raise HTTPException(status_code=429, detail=f"Please wait {wait} seconds before requesting another code.")

    password_hash = _hash_password(payload.password) if purpose == "register" else None
    code = f"{secrets.randbelow(1_000_000):06d}"
    _deliver_otp(identifier, method, code)
    now = int(time.time())
    with _connection() as db:
        db.execute("""INSERT INTO auth_challenges
            (identifier, purpose, method, password_hash, otp_hash, expires_at, resend_at, attempts, first_name, middle_name, last_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
            ON CONFLICT(identifier) DO UPDATE SET
              purpose = excluded.purpose,
              method = excluded.method,
              password_hash = excluded.password_hash,
              otp_hash = excluded.otp_hash,
              expires_at = excluded.expires_at,
              resend_at = excluded.resend_at,
              attempts = 0,
              first_name = excluded.first_name,
              middle_name = excluded.middle_name,
              last_name = excluded.last_name""",
            (identifier, purpose, method, password_hash,
             _otp_digest(secret, identifier, purpose, code),
             now + OTP_LIFETIME_SECONDS, now + OTP_RESEND_SECONDS,
             first_name, middle_name, last_name),
        )
    return {"message": f"Verification code sent to {identifier}.", "expires_in": OTP_LIFETIME_SECONDS, "resend_after": OTP_RESEND_SECONDS}


def _verify_otp(payload: OTPRequest, purpose: str) -> dict:
    secret = _auth_secret()
    if not re.fullmatch(r"\d{6}", payload.code):
        raise HTTPException(status_code=422, detail="Enter the 6-digit verification code.")
    identifier, _ = _normalize_identifier(payload.identifier)
    with _connection() as db:
        challenge = db.execute("SELECT * FROM auth_challenges WHERE identifier = ?", (identifier,)).fetchone()
        now = int(time.time())
        if not challenge or challenge["purpose"] != purpose:
            raise HTTPException(status_code=400, detail="No active verification code was found. Request a new code.")
        if challenge["expires_at"] < now:
            db.execute("DELETE FROM auth_challenges WHERE identifier = ?", (identifier,))
            db.commit()
            raise HTTPException(status_code=400, detail="That code has expired. Request a new one.")
        if challenge["attempts"] >= OTP_MAX_ATTEMPTS:
            db.execute("DELETE FROM auth_challenges WHERE identifier = ?", (identifier,))
            db.commit()
            raise HTTPException(status_code=429, detail="Too many incorrect codes. Request a new code.")
        expected = challenge["otp_hash"]
        actual = _otp_digest(secret, identifier, purpose, payload.code)
        if not hmac.compare_digest(actual, expected):
            attempts = challenge["attempts"] + 1
            if attempts >= OTP_MAX_ATTEMPTS:
                db.execute("DELETE FROM auth_challenges WHERE identifier = ?", (identifier,))
                db.commit()
                raise HTTPException(status_code=429, detail="Too many incorrect codes. Request a new code.")
            db.execute("UPDATE auth_challenges SET attempts = ? WHERE identifier = ?", (attempts, identifier))
            db.commit()
            raise HTTPException(status_code=400, detail=f"That code is incorrect. {OTP_MAX_ATTEMPTS - attempts} attempts remain.")

        if purpose == "register":
            if not challenge["password_hash"]:
                db.execute("DELETE FROM auth_challenges WHERE identifier = ?", (identifier,))
                db.commit()
                raise HTTPException(status_code=400, detail="Registration expired. Start again.")
            user_id = str(uuid.uuid4())
            try:
                db.execute("""INSERT INTO users
                    (id, identifier, method, password_hash, created_at, verified_at, first_name, middle_name, last_name)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (user_id, identifier, challenge["method"], challenge["password_hash"], now, now,
                     challenge["first_name"], challenge["middle_name"], challenge["last_name"]),
                )
            except sqlite3.IntegrityError as exc:
                db.rollback()
                db.execute("DELETE FROM auth_challenges WHERE identifier = ?", (identifier,))
                db.commit()
                raise HTTPException(status_code=409, detail="An account already uses this email or phone. Sign in instead.") from exc
        db.execute("DELETE FROM auth_challenges WHERE identifier = ?", (identifier,))
    return _issue_login_result(identifier)


@router.post("/register/request-otp")
def register_request_otp(payload: CredentialRequest, request: Request):
    _check_send_rate_limit(request.client.host if request.client else "unknown")
    return _request_otp(payload, "register")


@router.post("/register/verify-otp")
def register_verify_otp(payload: OTPRequest):
    return _verify_otp(payload, "register")


@router.post("/login/request-otp")
def login_request_otp(payload: CredentialRequest, request: Request):
    _check_send_rate_limit(request.client.host if request.client else "unknown")
    return _request_otp(payload, "login")


@router.post("/login/verify-otp")
def login_verify_otp(payload: OTPRequest):
    return _verify_otp(payload, "login")


@router.get("/me")
def get_current_user(user: dict = Depends(current_user)):
    return {
        "user_id": user["id"],
        **{key: user[key] for key in ("identifier", "method", "first_name", "middle_name", "last_name")},
    }


@router.post("/logout")
def logout(authorization: str | None = Header(default=None), _user: dict = Depends(current_user)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Please sign in to continue.")
    claims = _decode_access_token(authorization.removeprefix("Bearer ").strip())
    with _connection() as db:
        db.execute(
            "INSERT OR IGNORE INTO revoked_tokens (token_id, expires_at) VALUES (?, ?)",
            (claims["jti"], claims["exp"]),
        )
        db.execute("DELETE FROM revoked_tokens WHERE expires_at < ?", (int(time.time()),))
    return {"message": "Signed out."}


@router.post("/password/change")
def change_password(payload: PasswordChangeRequest, user: dict = Depends(current_user)):
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=422, detail="Choose a new password that differs from the current one.")
    with _connection() as db:
        row = db.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],)).fetchone()
        if not row or not _password_matches(payload.current_password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Current password is incorrect.")
        db.execute(
            "UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?",
            (_hash_password(payload.new_password), user["id"]),
        )
        updated_user = db.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    return {
        "message": "Password changed. Other signed-in devices have been signed out.",
        "access_token": _create_access_token(updated_user),
    }


@router.post("/contact/request-otp")
def request_contact_change(payload: ContactChangeRequest, request: Request, user: dict = Depends(current_user)):
    _check_send_rate_limit(request.client.host if request.client else "unknown")
    identifier, method = _normalize_identifier(payload.identifier)
    with _connection() as db:
        row = db.execute("SELECT password_hash, identifier FROM users WHERE id = ?", (user["id"],)).fetchone()
        if not row or not _password_matches(payload.current_password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Current password is incorrect.")
        if identifier == row["identifier"]:
            raise HTTPException(status_code=422, detail="That is already your verified contact address.")
        existing = db.execute("SELECT id FROM users WHERE identifier = ?", (identifier,)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Another account already uses that email or phone.")
        challenge = db.execute(
            "SELECT resend_at FROM contact_update_challenges WHERE user_id = ?", (user["id"],)
        ).fetchone()
        now = int(time.time())
        if challenge and challenge["resend_at"] > now:
            raise HTTPException(status_code=429, detail=f"Please wait {challenge['resend_at'] - now} seconds before requesting another code.")
        pending = db.execute(
            "SELECT user_id FROM contact_update_challenges WHERE identifier = ?", (identifier,)
        ).fetchone()
        if pending and pending["user_id"] != user["id"]:
            raise HTTPException(status_code=409, detail="A contact change is already being verified for that address.")

    code = f"{secrets.randbelow(1_000_000):06d}"
    _deliver_otp(identifier, method, code)
    now = int(time.time())
    with _connection() as db:
        db.execute("""INSERT INTO contact_update_challenges
            (user_id, identifier, method, otp_hash, expires_at, resend_at, attempts)
            VALUES (?, ?, ?, ?, ?, ?, 0)
            ON CONFLICT(user_id) DO UPDATE SET
              identifier = excluded.identifier, method = excluded.method,
              otp_hash = excluded.otp_hash, expires_at = excluded.expires_at,
              resend_at = excluded.resend_at, attempts = 0""",
            (user["id"], identifier, method,
             _otp_digest(_auth_secret(), identifier, "contact-change", code),
             now + OTP_LIFETIME_SECONDS, now + OTP_RESEND_SECONDS),
        )
    return {"message": f"Verification code sent to {identifier}.", "expires_in": OTP_LIFETIME_SECONDS, "resend_after": OTP_RESEND_SECONDS}


@router.post("/contact/verify-otp")
def verify_contact_change(payload: ContactVerifyRequest, user: dict = Depends(current_user)):
    if not re.fullmatch(r"\d{6}", payload.code):
        raise HTTPException(status_code=422, detail="Enter the 6-digit verification code.")
    identifier, _ = _normalize_identifier(payload.identifier)
    with _connection() as db:
        challenge = db.execute(
            "SELECT * FROM contact_update_challenges WHERE user_id = ? AND identifier = ?",
            (user["id"], identifier),
        ).fetchone()
        now = int(time.time())
        if not challenge:
            raise HTTPException(status_code=400, detail="No active contact verification code was found. Request a new code.")
        if challenge["expires_at"] < now:
            db.execute("DELETE FROM contact_update_challenges WHERE user_id = ?", (user["id"],))
            db.commit()
            raise HTTPException(status_code=400, detail="That code has expired. Request a new one.")
        expected = _otp_digest(_auth_secret(), identifier, "contact-change", payload.code)
        if challenge["attempts"] >= OTP_MAX_ATTEMPTS:
            db.execute("DELETE FROM contact_update_challenges WHERE user_id = ?", (user["id"],))
            db.commit()
            raise HTTPException(status_code=429, detail="Too many incorrect codes. Request a new code.")
        if not hmac.compare_digest(expected, challenge["otp_hash"]):
            attempts = challenge["attempts"] + 1
            if attempts >= OTP_MAX_ATTEMPTS:
                db.execute("DELETE FROM contact_update_challenges WHERE user_id = ?", (user["id"],))
                db.commit()
                raise HTTPException(status_code=429, detail="Too many incorrect codes. Request a new code.")
            db.execute("UPDATE contact_update_challenges SET attempts = ? WHERE user_id = ?", (attempts, user["id"]))
            db.commit()
            raise HTTPException(status_code=400, detail=f"That code is incorrect. {OTP_MAX_ATTEMPTS - attempts} attempts remain.")
        db.execute(
            "UPDATE users SET identifier = ?, method = ?, verified_at = ? WHERE id = ?",
            (identifier, challenge["method"], now, user["id"]),
        )
        db.execute("DELETE FROM contact_update_challenges WHERE user_id = ?", (user["id"],))
    return _issue_login_result(identifier)


@router.post("/logout-all")
def logout_all(user: dict = Depends(current_user)):
    with _connection() as db:
        db.execute("UPDATE users SET token_version = token_version + 1 WHERE id = ?", (user["id"],))
    return {"message": "Signed out of all devices."}


@router.delete("/me")
def delete_account(payload: AccountDeleteRequest, user: dict = Depends(current_user)):
    with _connection() as db:
        row = db.execute("SELECT password_hash, identifier FROM users WHERE id = ?", (user["id"],)).fetchone()
        if not row or not _password_matches(payload.password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Password is incorrect.")
        db.execute("DELETE FROM contact_update_challenges WHERE user_id = ?", (user["id"],))
        db.execute("DELETE FROM auth_challenges WHERE identifier = ?", (row["identifier"],))
        db.execute("DELETE FROM users WHERE id = ?", (user["id"],))
    return {"message": "Account deleted."}
