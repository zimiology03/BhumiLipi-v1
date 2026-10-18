from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import secrets
import os
import unicodedata
from auth import init_auth_db, router as auth_router
from assistant import router as assistant_router
class DocumentReviewRequest(BaseModel):
    land_id: str
    mouza: str
    dag: str
    khatian: str
    area_decimal: float
app = FastAPI(
    title="BhumiLipi API",
    description="Synthetic land-record and fraud-risk demo",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(assistant_router)
app.include_router(auth_router)


@app.on_event("startup")
def initialize_auth_storage():
    init_auth_db()
# কাল্পনিক demo data—কোনো বাস্তব জমি বা ব্যক্তি নয়।
LANDS = [
    {
        "land_id": "BL-001",
        "district": "Sample District",
        "upazila": "Sample Upazila 1",
        "mouza": "Greenpur",
        "khatian_number": "KH-501",
        "dag_number": "101",
        "area_decimal": 10,
        "owner_ref": "OWN-002",
        "risk_score": 85,
        "risk_level": "High",
        "risk_factors": ["একই জমিতে দুই ক্রেতার দলিল রেকর্ড আছে"],
        "latitude": 23.8103,
        "longitude": 90.4125,
        "demo": True,
    },
    {
        "land_id": "BL-002",
        "district": "Sample District",
        "upazila": "Sample Upazila 1",
        "mouza": "Greenpur",
        "khatian_number": "KH-502",
        "dag_number": "102",
        "area_decimal": 8,
        "owner_ref": "OWN-005",
        "risk_score": 10,
        "risk_level": "Low",
        "risk_factors": [],
        "latitude": 23.8113,
        "longitude": 90.4135,
        "demo": True,
    },
    {
        "land_id": "BL-003",
        "district": "Sample District",
        "upazila": "Sample Upazila 2",
        "mouza": "Peacepur",
        "khatian_number": "KH-601",
        "dag_number": "201",
        "area_decimal": 12,
        "owner_ref": "OWN-008",
        "risk_score": 65,
        "risk_level": "High",
        "risk_factors": ["অল্প সময়ের মধ্যে একাধিক মালিকানা transfer"],
        "latitude": 23.8123,
        "longitude": 90.4110,
        "demo": True,
    },
    {
        "land_id": "BL-004",
        "district": "Sample District",
        "upazila": "Sample Upazila 2",
        "mouza": "Peacepur",
        "khatian_number": "KH-602",
        "dag_number": "202",
        "area_decimal": 6,
        "owner_ref": "OWN-009",
        "risk_score": 55,
        "risk_level": "Medium",
        "risk_factors": ["দলিল ও mutation record-এ মালিকের তথ্য মেলেনি"],
        "latitude": 23.8096,
        "longitude": 90.4144,
        "demo": True,
    },
    {
        "land_id": "BL-005", "district": "Sample District", "upazila": "Sample Upazila 1",
        "mouza": "Greenpur", "khatian_number": "KH-503", "dag_number": "103", "area_decimal": 7.5,
        "owner_ref": "OWN-012", "risk_score": 28, "risk_level": "Low", "risk_factors": [],
        "latitude": 23.8108, "longitude": 90.4129, "demo": True,
    },
    {
        "land_id": "BL-006", "district": "Sample District", "upazila": "Sample Upazila 1",
        "mouza": "Greenpur", "khatian_number": "KH-504", "dag_number": "104", "area_decimal": 15,
        "owner_ref": "OWN-013", "risk_score": 72, "risk_level": "High",
        "risk_factors": ["Synthetic demo flag: overlapping transfer records"],
        "latitude": 23.8118, "longitude": 90.4140, "demo": True,
    },
    {
        "land_id": "BL-007", "district": "Sample District", "upazila": "Sample Upazila 1",
        "mouza": "Greenpur", "khatian_number": "KH-505", "dag_number": "105", "area_decimal": 5.5,
        "owner_ref": "OWN-014", "risk_score": 48, "risk_level": "Medium",
        "risk_factors": ["Synthetic demo flag: record details need review"],
        "latitude": 23.8099, "longitude": 90.4118, "demo": True,
    },
    {
        "land_id": "BL-008", "district": "Sample District", "upazila": "Sample Upazila 1",
        "mouza": "Greenpur", "khatian_number": "KH-506", "dag_number": "106", "area_decimal": 9,
        "owner_ref": "OWN-015", "risk_score": 18, "risk_level": "Low", "risk_factors": [],
        "latitude": 23.8121, "longitude": 90.4121, "demo": True,
    },
    {
        "land_id": "BL-009", "district": "Sample District", "upazila": "Sample Upazila 2",
        "mouza": "Peacepur", "khatian_number": "KH-603", "dag_number": "203", "area_decimal": 11,
        "owner_ref": "OWN-016", "risk_score": 33, "risk_level": "Low", "risk_factors": [],
        "latitude": 23.8130, "longitude": 90.4105, "demo": True,
    },
    {
        "land_id": "BL-010", "district": "Sample District", "upazila": "Sample Upazila 2",
        "mouza": "Peacepur", "khatian_number": "KH-604", "dag_number": "204", "area_decimal": 7,
        "owner_ref": "OWN-017", "risk_score": 78, "risk_level": "High",
        "risk_factors": ["Synthetic demo flag: multiple owner references"],
        "latitude": 23.8089, "longitude": 90.4151, "demo": True,
    },
    {
        "land_id": "BL-011", "district": "Sample District", "upazila": "Sample Upazila 2",
        "mouza": "Peacepur", "khatian_number": "KH-605", "dag_number": "205", "area_decimal": 13.5,
        "owner_ref": "OWN-018", "risk_score": 51, "risk_level": "Medium",
        "risk_factors": ["Synthetic demo flag: mutation details need review"],
        "latitude": 23.8102, "longitude": 90.4160, "demo": True,
    },
    {
        "land_id": "BL-012", "district": "Sample District", "upazila": "Sample Upazila 2",
        "mouza": "Peacepur", "khatian_number": "KH-606", "dag_number": "206", "area_decimal": 4.25,
        "owner_ref": "OWN-019", "risk_score": 22, "risk_level": "Low", "risk_factors": [],
        "latitude": 23.8137, "longitude": 90.4128, "demo": True,
    },
]


@app.get("/")
def home():
    return {"message": "BhumiLipi API is running", "demo_data": True}


@app.get("/health")
def health():
    return {"status": "ok", "mode": "synthetic demo"}


@app.get("/land")
def search_land(q: str | None = None):
    if not q:
        return LANDS

    query = q.strip().lower()
    return [
        land for land in LANDS
        if query in land["land_id"].lower()
        or query in land["mouza"].lower()
        or query in land["khatian_number"].lower()
        or query in land["dag_number"].lower()
    ]


@app.get("/land/{land_id}")
def get_land(land_id: str):
    for land in LANDS:
        if land["land_id"].lower() == land_id.lower():
            return land
    raise HTTPException(status_code=404, detail="Demo land record not found")

VERIFICATION_TOKENS = {
    land["land_id"]: secrets.token_urlsafe(24)
    for land in LANDS
}

DEMO_HISTORY = {
    land["land_id"]: [
        {
            "date": "2021-04-12",
            "event": "Synthetic demo record created",
            "reference": f"DEMO-{land['land_id']}-01",
        },
        {
            "date": "2024-08-20",
            "event": "Synthetic demo record reviewed",
            "reference": f"DEMO-{land['land_id']}-02",
        },
    ]
    for land in LANDS
}


@app.get("/land/{land_id}/passport")
def get_land_passport(land_id: str):
    land = next(
        (item for item in LANDS if item["land_id"].lower() == land_id.lower()),
        None,
    )
    if land is None:
        raise HTTPException(status_code=404, detail="Demo land record not found")

    return {
        "land": land,
        "transfer_history": DEMO_HISTORY[land["land_id"]],
        "verification_token": VERIFICATION_TOKENS[land["land_id"]],
        "integrity_status": "demo_check_passed",
        "last_updated": "2026-10-15",
        "demo": True,
        "disclaimer": "Synthetic demo only; this is not an official government verification.",
    }


@app.post("/verify")
def verify_passport(payload: dict):
    token = payload.get("token", "")
    land_id = next(
        (
            current_land_id
            for current_land_id, saved_token in VERIFICATION_TOKENS.items()
            if secrets.compare_digest(str(token), saved_token)
        ),
        None,
    )

    if land_id is None:
        return {
            "record_exists": False,
            "integrity_check_passed": False,
            "demo": True,
        }

    return {
        "record_exists": True,
        "integrity_check_passed": True,
        "land_id": land_id,
        "last_updated": "2026-10-15",
        "demo": True,
        "disclaimer": "Synthetic demo only; this is not proof of legal ownership.",
    }
@app.post("/land-value/estimate")
def estimate_land_value(payload: dict):
    land_id = str(payload.get("land_id", "")).strip()

    land = next(
        (item for item in LANDS if item["land_id"].lower() == land_id.lower()),
        None,
    )
    if land is None:
        raise HTTPException(status_code=404, detail="Demo land record not found")

    synthetic_price_per_decimal = {
        "Greenpur": 180000,
        "Peacepur": 125000,
    }
    base_price = synthetic_price_per_decimal.get(land["mouza"], 100000)
    area = float(land["area_decimal"])

    return {
        "land_id": land["land_id"],
        "area_decimal": area,
        "currency": "BDT",
        "estimated_price_per_decimal_min": round(base_price * 0.85),
        "estimated_price_per_decimal_max": round(base_price * 1.15),
        "estimated_total_min": round(area * base_price * 0.85),
        "estimated_total_max": round(area * base_price * 1.15),
        "basis": "Synthetic demo baseline by sample mouza",
        "demo": True,
        "disclaimer": "Illustrative synthetic estimate only; not a current market price or official valuation.",
    }


@app.get("/fraud-alerts")
def fraud_alerts():
    return [land for land in LANDS if land["risk_score"] >= 50]


@app.get("/statistics")
def statistics():
    return {
        "total_demo_lands": len(LANDS),
        "flagged_lands": sum(1 for land in LANDS if land["risk_score"] >= 50),
        "high_risk_lands": sum(1 for land in LANDS if land["risk_score"] >= 60),
        "demo_data": True,
    }
@app.post("/document-review")
def review_document(payload: DocumentReviewRequest):
    land = next(
        (item for item in LANDS if item.get("land_id") == payload.land_id),
        None,
    )

    if land is None:
        raise HTTPException(
            status_code=404,
            detail="Land ID not found in synthetic demo records",
        )

    mismatches = []
    matched_fields = []
    field_map = {
        "mouza": "mouza",
        "dag": "dag_number",
        "khatian": "khatian_number",
    }

    for request_field, record_field in field_map.items():
        document_value = unicodedata.normalize("NFKC", getattr(payload, request_field)).strip().casefold()
        record_value = unicodedata.normalize("NFKC", str(land.get(record_field, ""))).strip().casefold()
        document_value = "".join(
            str(unicodedata.digit(char)) if char.isdigit() else char
            for char in document_value
        )
        record_value = "".join(
            str(unicodedata.digit(char)) if char.isdigit() else char
            for char in record_value
        )
        if document_value != record_value:
            mismatches.append(request_field)
        else:
            matched_fields.append(request_field)

    record_area = float(land.get("area_decimal", 0))
    if abs(record_area - payload.area_decimal) > 0.01:
        mismatches.append("area_decimal")
    else:
        matched_fields.append("area_decimal")

    return {
        "land_id": payload.land_id,
        "status": "review_needed" if mismatches else "no_mismatch_found",
        "mismatch_fields": mismatches,
        "matched_fields": matched_fields,
        "checked_fields": ["mouza", "dag", "khatian", "area_decimal"],
        "demo": True,
        "disclaimer": "Synthetic demo comparison only; this does not verify legal authenticity or prove fraud.",
    }
@app.get("/build-suitability/{land_id}")
def get_build_suitability(land_id: str):
    land = next(
        (item for item in LANDS if item.get("land_id") == land_id),
        None,
    )

    if land is None:
        raise HTTPException(
            status_code=404,
            detail="Land ID not found in synthetic demo records",
        )

    return {
        "land_id": land_id,
        "soil_test_available": land_id == "BL-001",
        "demo": True,
        "disclaimer": "Synthetic demo status only; this is not a construction safety assessment.",
    }
