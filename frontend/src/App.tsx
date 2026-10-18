import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { createWorker } from 'tesseract.js'
import './App.css'
import AssistantPanel from './components/AssistantPanel'
import AccountPanel from './components/AccountPanel'
import InheritanceCalculator from './components/InheritanceCalculator'
import SatelliteView from './components/SatelliteView'
import PriceProjectionChart from './components/PriceProjectionChart'
type Land = {
  land_id: string
  district: string
  upazila: string
  mouza: string
  khatian_number: string
  dag_number: string | number
  area_decimal: number
  owner_ref: string
  risk_score: number
  risk_level?: string
  risk_factors?: string[]
  latitude?: number
  longitude?: number
  demo?: boolean
}

type Page = 'dashboard' | 'search' | 'reports' | 'laws' | 'faq' | 'buildability' | 'inheritance' | 'about' | 'profile'
type AuthUser = { user_id: string; identifier: string; method: 'email' | 'phone'; first_name: string; middle_name: string; last_name: string }
const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

function readPreference(key: string, fallback: string) {
  try { return window.localStorage.getItem(key) || fallback } catch { return fallback }
}

async function accountApiRequest<T>(token: string, path: string, method: string, payload?: object): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/auth/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    })
  } catch {
    throw new Error('Cannot reach the backend. Check that the BhumiLipi backend is running.')
  }
  const data = await response.json().catch(() => ({})) as { detail?: string }
  if (!response.ok) throw new Error(data.detail || 'Account request failed. Please try again.')
  return data as T
}

const faqEntries = [
  {
    questionBn: 'জমি কীভাবে খুঁজব?', answerBn: 'Land Search-এ জেলা, উপজেলা ও মৌজা বেছে নিন। খতিয়ান বা দাগ নম্বর থাকলে দিন; Unique ID ঐচ্ছিক। এটি synthetic demo, তাই ফলাফল সরকারি জমির রেকর্ড নয়।',
    questionEn: 'How do I search for land?', answerEn: 'In Land Search, choose a district, upazila, and mouza. Add a khatian or dag number if available; the unique ID is optional. This is synthetic demo data, not an official land record.',
    keywords: 'search land mouza district upazila khatian dag unique id find জমি খোঁজা মৌজা জেলা উপজেলা খতিয়ান দাগ আইডি',
  },
  {
    questionBn: 'Unique ID না জানলে কী করব?', answerBn: 'জেলা, উপজেলা, মৌজা এবং খতিয়ান/দাগ দিয়ে খুঁজুন। Unique ID থাকলে ফল নির্দিষ্ট করতে সাহায্য করে, তবে না দিলেও খোঁজা যাবে।',
    questionEn: 'What if I do not know the unique ID?', answerEn: 'Search by district, upazila, mouza, and any khatian or dag details you know. A unique ID can narrow the result, but it is optional.',
    keywords: 'unique id optional land id parcel code search আইডি ইউনিক পরিচিতি',
  },
  {
    questionBn: 'স্যাটেলাইট ভিউ কোথায় দেখব?', answerBn: 'Land Search-এ জমি খুঁজে ফলাফলের সঙ্গে থাকা satellite view খুলুন। অবস্থান বা মানচিত্রের ছবি দেখে সরকারি সীমানা বা মালিকানা নিশ্চিত করা যায় না।',
    questionEn: 'Where can I see the satellite view?', answerEn: 'Search for a land record in Land Search and open the satellite view shown with the result. Imagery does not verify official boundaries or ownership.',
    keywords: 'satellite map imagery location view coordinates ছবি মানচিত্র অবস্থান সীমানা',
  },
  {
    questionBn: 'এই তথ্যগুলো কি সরকারি বা বাস্তব জমির রেকর্ড?', answerBn: 'না। prototype-এর জমি ও ঝুঁকি তথ্য synthetic demo data। এগুলো বাস্তব মালিকানা, দলিল বা সরকারি যাচাইয়ের প্রমাণ নয়।',
    questionEn: 'Are these official or real land records?', answerEn: 'No. Land and risk information in this prototype is synthetic demo data. It is not proof of ownership, a deed, or official verification.',
    keywords: 'synthetic demo official real record ownership verify সরকারি বাস্তব রেকর্ড মালিকানা যাচাই',
  },
  {
    questionBn: 'ঝুঁকির স্কোর কি জালিয়াতির প্রমাণ?', answerBn: 'না। স্কোর কেবল demo-র প্রাথমিক সংকেত; এটি জালিয়াতি বা বিরোধের সিদ্ধান্ত নয়। মূল দলিল ও সরকারি রেকর্ড সংশ্লিষ্ট ভূমি অফিস/যোগ্য আইনজীবীর মাধ্যমে যাচাই করুন।',
    questionEn: 'Does a risk score prove fraud?', answerEn: 'No. It is only a preliminary demo indicator, not a finding of fraud or dispute. Check original deeds and official records with the relevant land office or a qualified lawyer.',
    keywords: 'risk score fraud dispute verify ঝুঁকি স্কোর জালিয়াতি বিরোধ',
  },
  {
    questionBn: 'খতিয়ান ও দাগ নম্বর কী?', answerBn: 'খতিয়ান হলো জমি-সংক্রান্ত রেকর্ড; দাগ নম্বর মৌজার ভেতরে নির্দিষ্ট প্লট চিহ্নিত করে। সরকারি কপি ও তথ্য ই-পর্চা বা সংশ্লিষ্ট ভূমি অফিসে মিলিয়ে নিন।',
    questionEn: 'What are khatian and dag numbers?', answerEn: 'A khatian is a land record, while a dag number identifies a plot within a mouza. Confirm details against e-Porcha or the relevant land office.',
    keywords: 'khatian dag mouza plot record খতিয়ান দাগ মৌজা রেকর্ড',
  },
  {
    questionBn: 'নামজারি বা মিউটেশন কী?', answerBn: 'মালিকানা পরিবর্তনের পর সরকারি ভূমি রেকর্ড হালনাগাদ করার প্রক্রিয়া। বর্তমান আবেদনপদ্ধতি ও অবস্থা সরকারি e-Mutation পোর্টালে যাচাই করুন।',
    questionEn: 'What is mutation?', answerEn: 'Mutation updates government land records after an ownership change. Check the official e-Mutation portal for current application steps and status.',
    keywords: 'mutation namjari ownership update নামজারি মিউটেশন মালিকানা রেকর্ড হালনাগাদ',
  },
  {
    questionBn: 'জমি রেজিস্ট্রেশনের ধাপ ও সরকারি খরচ কোথায় পাব?', answerBn: 'Land Laws & Guides মডিউলে সাধারণ ধাপ, দরকারি কাগজ, সরকারি সূত্র ও যোগাযোগের লিংক আছে। ফি দলিল ও এলাকার ওপর নির্ভর করতে পারে—পরিশোধের আগে সংশ্লিষ্ট Sub-Registrar অফিসের বর্তমান তালিকা দেখুন।',
    questionEn: 'Where can I find deed-registration steps and official costs?', answerEn: 'The Land Laws & Guides module has a general checklist, documents, official references, and contacts. Charges can depend on the deed and location, so confirm the current schedule with the relevant Sub-Registrar office before paying.',
    keywords: 'registration deed cost fee documents sub registrar দলিল রেজিস্ট্রেশন খরচ ফি কাগজ সাব রেজিস্ট্রার',
  },
  {
    questionBn: 'জমি কেনা বা রেজিস্ট্রেশনে সাহায্য কোথায় পাব?', answerBn: 'Land Laws & Guides-এর registration guide দেখুন। সরকারি যোগাযোগের জন্য ভূমি পোর্টালের ১৬১২২ হটলাইন ও সংশ্লিষ্ট অফিসের তথ্যও সেখানে আছে। ব্যক্তিগত/দলিল-লেখকের ফি সরকারি ফি নয়—লিখিত হিসাব ও রসিদ নিন।',
    questionEn: 'Where can I get help buying or registering land?', answerEn: 'See the registration guide in Land Laws & Guides. It also lists the Ministry of Land 16122 hotline and official office links. Ask for an itemized quote and receipt for private professional charges.',
    keywords: 'help contact hotline 16122 lawyer office registration support সাহায্য যোগাযোগ হটলাইন অফিস',
  },
  {
    questionBn: 'উত্তরাধিকার ক্যালকুলেটর কীভাবে ব্যবহার করব?', answerBn: 'উত্তরাধিকার ক্যালকুলেটরে প্রযোজ্য পরিবার-সংক্রান্ত তথ্য দিন। এটি সীমিত educational estimate; সব উত্তরাধিকারী, দেনা, উইল, ব্যক্তিগত আইন ও দলিল যাচাই ছাড়া বাস্তব বণ্টনের সিদ্ধান্ত হিসেবে ব্যবহার করবেন না।',
    questionEn: 'How do I use the inheritance calculator?', answerEn: 'Enter the relevant family details in the Inheritance Calculator. It provides a limited educational estimate; do not use it to distribute an estate without verifying all heirs, debts, wills, applicable personal law, and documents.',
    keywords: 'inheritance calculator heirs share estate family উত্তরাধিকার ক্যালকুলেটর ওয়ারিশ অংশ',
  },
  {
    questionBn: 'নির্মাণ উপযোগিতা যাচাই কি নিরাপত্তার নিশ্চয়তা দেয়?', answerBn: 'না। Build Suitability কেবল প্রাথমিক demo নির্দেশনা। নির্মাণের আগে site-specific soil/geotechnical report, জরিপ, zoning ও permit এবং যোগ্য প্রকৌশলীর পর্যালোচনা দরকার।',
    questionEn: 'Does build-suitability checking guarantee safety?', answerEn: 'No. Build Suitability is only preliminary demo guidance. Before building, obtain site-specific soil/geotechnical reports, survey, zoning and permit checks, and a qualified engineer’s review.',
    keywords: 'build suitability construction soil safety permit engineer নির্মাণ উপযোগিতা মাটি নিরাপত্তা অনুমতি প্রকৌশলী',
  },
]

const demoLands: Land[] = [
  {
    land_id: 'BL-001',
    district: 'Sample District',
    upazila: 'Sample Upazila 1',
    mouza: 'Greenpur',
    khatian_number: 'KH-501',
    dag_number: 101,
    area_decimal: 10,
    owner_ref: 'OWN-002',
    risk_score: 85,
    risk_level: 'High',
    risk_factors: ['একই জমিতে দুই ক্রেতার দলিল রেকর্ড আছে'],
    latitude: 23.8103,
    longitude: 90.4125,
    demo: true,
  },
  {
    land_id: 'BL-002',
    district: 'Sample District',
    upazila: 'Sample Upazila 1',
    mouza: 'Greenpur',
    khatian_number: 'KH-502',
    dag_number: 102,
    area_decimal: 8,
    owner_ref: 'OWN-005',
    risk_score: 10,
    risk_level: 'Low',
    risk_factors: [],
    latitude: 23.8113,
    longitude: 90.4135,
    demo: true,
  },
  {
    land_id: 'BL-003',
    district: 'Sample District',
    upazila: 'Sample Upazila 2',
    mouza: 'Peacepur',
    khatian_number: 'KH-601',
    dag_number: 201,
    area_decimal: 12,
    owner_ref: 'OWN-008',
    risk_score: 68,
    risk_level: 'High',
    risk_factors: ['অল্প সময়ের মধ্যে একাধিক মালিকানা transfer'],
    latitude: 23.8123,
    longitude: 90.4110,
    demo: true,
  },
  {
    land_id: 'BL-004',
    district: 'Sample District',
    upazila: 'Sample Upazila 2',
    mouza: 'Peacepur',
    khatian_number: 'KH-602',
    dag_number: 202,
    area_decimal: 6,
    owner_ref: 'OWN-010',
    risk_score: 42,
    risk_level: 'Medium',
    risk_factors: ['নামজারি ও নিবন্ধন তথ্য মিলিয়ে দেখা দরকার'],
    latitude: 23.8096,
    longitude: 90.4144,
    demo: true,
  },
  { land_id: 'BL-005', district: 'Sample District', upazila: 'Sample Upazila 1', mouza: 'Greenpur', khatian_number: 'KH-503', dag_number: 103, area_decimal: 7.5, owner_ref: 'OWN-012', risk_score: 28, risk_level: 'Low', risk_factors: [], latitude: 23.8108, longitude: 90.4129, demo: true },
  { land_id: 'BL-006', district: 'Sample District', upazila: 'Sample Upazila 1', mouza: 'Greenpur', khatian_number: 'KH-504', dag_number: 104, area_decimal: 15, owner_ref: 'OWN-013', risk_score: 72, risk_level: 'High', risk_factors: ['Synthetic demo flag: overlapping transfer records'], latitude: 23.8118, longitude: 90.4140, demo: true },
  { land_id: 'BL-007', district: 'Sample District', upazila: 'Sample Upazila 1', mouza: 'Greenpur', khatian_number: 'KH-505', dag_number: 105, area_decimal: 5.5, owner_ref: 'OWN-014', risk_score: 48, risk_level: 'Medium', risk_factors: ['Synthetic demo flag: record details need review'], latitude: 23.8099, longitude: 90.4118, demo: true },
  { land_id: 'BL-008', district: 'Sample District', upazila: 'Sample Upazila 1', mouza: 'Greenpur', khatian_number: 'KH-506', dag_number: 106, area_decimal: 9, owner_ref: 'OWN-015', risk_score: 18, risk_level: 'Low', risk_factors: [], latitude: 23.8121, longitude: 90.4121, demo: true },
  { land_id: 'BL-009', district: 'Sample District', upazila: 'Sample Upazila 2', mouza: 'Peacepur', khatian_number: 'KH-603', dag_number: 203, area_decimal: 11, owner_ref: 'OWN-016', risk_score: 33, risk_level: 'Low', risk_factors: [], latitude: 23.8130, longitude: 90.4105, demo: true },
  { land_id: 'BL-010', district: 'Sample District', upazila: 'Sample Upazila 2', mouza: 'Peacepur', khatian_number: 'KH-604', dag_number: 204, area_decimal: 7, owner_ref: 'OWN-017', risk_score: 78, risk_level: 'High', risk_factors: ['Synthetic demo flag: multiple owner references'], latitude: 23.8089, longitude: 90.4151, demo: true },
  { land_id: 'BL-011', district: 'Sample District', upazila: 'Sample Upazila 2', mouza: 'Peacepur', khatian_number: 'KH-605', dag_number: 205, area_decimal: 13.5, owner_ref: 'OWN-018', risk_score: 51, risk_level: 'Medium', risk_factors: ['Synthetic demo flag: mutation details need review'], latitude: 23.8102, longitude: 90.4160, demo: true },
  { land_id: 'BL-012', district: 'Sample District', upazila: 'Sample Upazila 2', mouza: 'Peacepur', khatian_number: 'KH-606', dag_number: 206, area_decimal: 4.25, owner_ref: 'OWN-019', risk_score: 22, risk_level: 'Low', risk_factors: [], latitude: 23.8137, longitude: 90.4128, demo: true },
]

function App() {
  const [lands, setLands] = useState<Land[]>([])
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState(false)
  const [query, setQuery] = useState('')
  const [satelliteLand, setSatelliteLand] = useState<Land | null>(null)
  const [voiceStatus, setVoiceStatus] = useState('')
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [buildAssessment, setBuildAssessment] = useState('')
  const [buildLandId, setBuildLandId] = useState('BL-001')
  const [deedFile, setDeedFile] = useState<File | null>(null)
  const [deedLandId, setDeedLandId] = useState('BL-001')
  const [ocrText, setOcrText] = useState('')
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null)
  const [deedReviewResult, setDeedReviewResult] = useState('')
  const [deedReviewing, setDeedReviewing] = useState(false)
    const handleBuildAssessment = async () => {
      setBuildAssessment(
        bangla ? 'তথ্য যাচাই করা হচ্ছে…' : 'Checking soil-test record…'
      )

      try {
        const response = await fetch(
          `${API_BASE}/build-suitability/${buildLandId}`
        )
        const data = await response.json()

        if (!response.ok) {
          throw new Error('Build suitability request failed')
        }

        if (data.soil_test_available) {
          setBuildAssessment(
            bangla
              ? 'ডেমো মাটির পরীক্ষার রেকর্ড আছে। এই প্রোটোটাইপ নির্মাণের নিরাপত্তা নিশ্চিত করতে পারে না; একজন যোগ্য প্রকৌশলীকে রিপোর্ট পর্যালোচনা করতে বলুন।'
              : 'Demo soil-test record is available. This prototype cannot confirm construction safety; have a qualified engineer review the report.'
          )
        } else {
          setBuildAssessment(
            bangla
              ? 'এই জমির কোনো মাটির পরীক্ষার তথ্য সংরক্ষিত নেই। নির্মাণের পরিকল্পনার আগে soil test করান।'
              : 'No soil-test information is on file for this land. Get a soil test before planning construction.'
          )
        }
      } catch {
        setBuildAssessment(
          bangla
            ? 'তথ্য আনা যায়নি। Backend চালু আছে কি না দেখুন।'
            : 'Could not load the soil-test status. Check that the backend is running.'
        )
      }
    }
  const scanDeedImage = async () => {
  if (!deedFile) {
    setOcrText(bangla ? 'আগে একটি ছবি বেছে নিন।' : 'Choose an image first.')
    return
  }

  setOcrText(bangla ? 'ছবির লেখা পড়া হচ্ছে…' : 'Reading text from image…')

  let worker

  try {
    worker = await createWorker('eng+ben')
    const { data } = await worker.recognize(deedFile)
    setOcrConfidence(Number.isFinite(data.confidence) ? data.confidence : null)
    setOcrText(
      data.text.trim() ||
        (bangla ? 'ছবিতে পড়ার মতো লেখা পাওয়া যায়নি।' : 'No readable text found in the image.')
    )
  } catch {
    setOcrText(
      bangla
        ? 'ছবি পড়া যায়নি। পরিষ্কার ছবি দিয়ে আবার চেষ্টা করুন।'
        : 'Could not read the image. Try a clearer picture.'
    )
  } finally {
    if (worker) await worker.terminate()
  }
}  
  const [page, setPage] = useState<Page>('dashboard')
  const [navOpen, setNavOpen] = useState(false)
  const [dashboardLandId, setDashboardLandId] = useState('BL-001')
  const [selectedLand, setSelectedLand] = useState<Land | null>(null)
  const [searchDetailsLandId, setSearchDetailsLandId] = useState('')
  const searchDetailsRef = useRef<HTMLElement | null>(null)
  const [reportsDetailsLandId, setReportsDetailsLandId] = useState('')
  const [authToken, setAuthToken] = useState('')
  const [continueAsDemo, setContinueAsDemo] = useState(false)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [profilePhoto, setProfilePhoto] = useState('')
  const [profilePhotoMessage, setProfilePhotoMessage] = useState('')
  const [accountSettingsBusy, setAccountSettingsBusy] = useState(false)
  const [accountSettingsMessage, setAccountSettingsMessage] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')

  useEffect(() => {
    if (!searchDetailsLandId || selectedLand?.land_id !== searchDetailsLandId) return

    const frame = window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      searchDetailsRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [searchDetailsLandId, selectedLand?.land_id])
  const [contactIdentifier, setContactIdentifier] = useState('')
  const [contactPassword, setContactPassword] = useState('')
  const [contactCode, setContactCode] = useState('')
  const [contactCodeStage, setContactCodeStage] = useState(false)
  const [contactResendSeconds, setContactResendSeconds] = useState(0)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [accountDialogMode, setAccountDialogMode] = useState<'login' | 'register' | null>(null)
  const [passport, setPassport] = useState<{
  transfer_history: { date: string; event: string; reference: string }[]
  verification_token: string
  integrity_status: string
  last_updated: string
  disclaimer: string
} | null>(null)
  const [landEstimateId, setLandEstimateId] = useState('')
  const [verificationResult, setVerificationResult] = useState('')
  const [landEstimate, setLandEstimate] = useState<{
  estimated_total_min: number
  estimated_total_max: number
  estimated_price_per_decimal_min: number
  estimated_price_per_decimal_max: number
  currency: string
  disclaimer: string
} | null>(null)
  const [bangla, setBangla] = useState(() => readPreference('bhumilipi-language', 'en') === 'bn')
  const [faqQuery, setFaqQuery] = useState('')
  const [dark, setDark] = useState(() => readPreference('bhumilipi-theme', 'light') === 'dark')
  const [verifyId, setVerifyId] = useState('')
  const [verifyResult, setVerifyResult] = useState('')

  useEffect(() => {
    try { window.localStorage.setItem('bhumilipi-language', bangla ? 'bn' : 'en') } catch { /* browser storage is optional */ }
  }, [bangla])

  useEffect(() => {
    try { window.localStorage.setItem('bhumilipi-theme', dark ? 'dark' : 'light') } catch { /* browser storage is optional */ }
  }, [dark])

  useEffect(() => {
    if (contactResendSeconds <= 0) return
    const timer = window.setTimeout(() => setContactResendSeconds((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [contactResendSeconds])

  useEffect(() => {
    if (!authUser?.user_id) {
      setProfilePhoto('')
      return
    }
    try {
      setProfilePhoto(window.localStorage.getItem(`bhumilipi-profile-photo:${authUser.user_id}`) || '')
    } catch {
      setProfilePhoto('')
    }
    setProfilePhotoMessage('')
  }, [authUser?.user_id])

  const handleProfilePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file || !authUser) return
    if (!file.type.startsWith('image/')) {
      setProfilePhotoMessage(bangla ? 'ছবির ফাইল নির্বাচন করুন।' : 'Choose an image file.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfilePhotoMessage(bangla ? 'ছবিটি ২ MB-এর কম হতে হবে।' : 'The image must be smaller than 2 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      try {
        window.localStorage.setItem(`bhumilipi-profile-photo:${authUser.user_id}`, reader.result)
        setProfilePhoto(reader.result)
        setProfilePhotoMessage('')
      } catch {
        setProfilePhotoMessage(bangla ? 'ছবিটি এই browser-এ সংরক্ষণ করা যায়নি।' : 'This browser could not save the photo.')
      }
    }
    reader.readAsDataURL(file)
  }

  const removeProfilePhoto = () => {
    if (!authUser) return
    try {
      window.localStorage.removeItem(`bhumilipi-profile-photo:${authUser.user_id}`)
    } catch {
      setProfilePhotoMessage(bangla ? 'এই browser থেকে ছবি সরানো যায়নি।' : 'This browser could not remove the photo.')
      return
    }
    setProfilePhoto('')
    setProfilePhotoMessage('')
  }

  const handlePasswordChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAccountSettingsMessage('')
    if (newPassword !== confirmNewPassword) {
      setAccountSettingsMessage(bangla ? 'নতুন password দুটি মিলছে না।' : 'The new passwords do not match.')
      return
    }
    setAccountSettingsBusy(true)
    try {
      const result = await accountApiRequest<{ message: string; access_token: string }>(authToken, 'password/change', 'POST', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      setAuthToken(result.access_token)
      setAccountSettingsMessage(result.message)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
    } catch (error) {
      setAccountSettingsMessage(error instanceof Error ? error.message : 'Could not change the password.')
    } finally {
      setAccountSettingsBusy(false)
    }
  }

  const requestContactCode = async () => {
    setAccountSettingsMessage('')
    setAccountSettingsBusy(true)
    try {
      const result = await accountApiRequest<{ message: string; resend_after: number }>(authToken, 'contact/request-otp', 'POST', {
        identifier: contactIdentifier,
        current_password: contactPassword,
      })
      setContactCodeStage(true)
      setContactResendSeconds(result.resend_after || 60)
      setAccountSettingsMessage(result.message)
    } catch (error) {
      setAccountSettingsMessage(error instanceof Error ? error.message : 'Could not send a verification code.')
    } finally {
      setAccountSettingsBusy(false)
    }
  }

  const verifyContactCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAccountSettingsMessage('')
    setAccountSettingsBusy(true)
    try {
      const result = await accountApiRequest<{ access_token: string; user: AuthUser }>(authToken, 'contact/verify-otp', 'POST', {
        identifier: contactIdentifier,
        code: contactCode,
      })
      setAuthToken(result.access_token)
      setAuthUser(result.user)
      setContactIdentifier('')
      setContactPassword('')
      setContactCode('')
      setContactCodeStage(false)
      setContactResendSeconds(0)
      setAccountSettingsMessage(bangla ? 'যোগাযোগের তথ্য যাচাই করে update করা হয়েছে।' : 'Your verified contact information has been updated.')
    } catch (error) {
      setAccountSettingsMessage(error instanceof Error ? error.message : 'Could not verify the new contact information.')
    } finally {
      setAccountSettingsBusy(false)
    }
  }

  const signOutAllDevices = async () => {
    if (!window.confirm(bangla ? 'সব device থেকে sign out করবেন? এই device-ও sign out হবে।' : 'Sign out from every device, including this one?')) return
    setAccountSettingsBusy(true)
    try {
      await accountApiRequest(authToken, 'logout-all', 'POST')
      window.alert(bangla ? 'সব device থেকে sign out করা হয়েছে। আবার sign in করুন।' : 'Signed out from all devices. Please sign in again.')
      setAuthToken('')
      setAuthUser(null)
      setContinueAsDemo(false)
      setPage('dashboard')
    } catch (error) {
      setAccountSettingsMessage(error instanceof Error ? error.message : 'Could not sign out all devices.')
    } finally {
      setAccountSettingsBusy(false)
    }
  }

  const deleteAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAccountSettingsMessage('')
    if (deleteConfirmation !== 'DELETE') {
      setAccountSettingsMessage(bangla ? 'নিশ্চিত করতে DELETE লিখুন।' : 'Type DELETE exactly to confirm.')
      return
    }
    if (!window.confirm(bangla ? 'এটি স্থায়ীভাবে আপনার account মুছে দেবে। চালিয়ে যাবেন?' : 'This permanently deletes your account. Continue?')) return
    setAccountSettingsBusy(true)
    try {
      await accountApiRequest(authToken, 'me', 'DELETE', { password: deletePassword })
      try { window.localStorage.removeItem(`bhumilipi-profile-photo:${authUser?.user_id}`) } catch { /* best-effort local cleanup */ }
      setAuthToken('')
      setAuthUser(null)
      setContinueAsDemo(false)
      setPage('dashboard')
      window.alert(bangla ? 'আপনার account মুছে ফেলা হয়েছে।' : 'Your account has been deleted.')
    } catch (error) {
      setAccountSettingsMessage(error instanceof Error ? error.message : 'Could not delete the account.')
    } finally {
      setAccountSettingsBusy(false)
    }
  }

  const selectPage = (nextPage: Page) => {
    setPage(nextPage)
    setNavOpen(false)
  }

  const logOutAccount = () => {
    if (authToken) {
      void fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      }).catch(() => {})
    }
    setAuthToken('')
    setAuthUser(null)
    setAccountDialogMode(null)
    setContinueAsDemo(false)
  }

  useEffect(() => {
    if (!navOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [navOpen])

  useEffect(() => {
    if (page !== 'reports' || !reportsDetailsLandId) return
    const frame = window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      document.getElementById('land-report-print')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [page, reportsDetailsLandId])

 const startVoiceInput = () => {
  const browserWindow = window as any
  const SpeechRecognition =
    browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition

  if (!SpeechRecognition) {
    setVoiceStatus(
      bangla
        ? 'এই browser-এ voice input support নেই। Chrome-এ চেষ্টা করুন।'
        : 'Voice input is not supported in this browser. Try Chrome.'
    )
    return
  }

  const recognition = new SpeechRecognition()
  recognition.lang = bangla ? 'bn-BD' : 'en-US'
  recognition.continuous = true
  recognition.interimResults = false

  recognition.onstart = () => {
    setVoiceStatus(bangla ? 'শুনছি…' : 'Listening…')
  }
  recognition.onresult = (event: any) => {
  const transcript = Array.from(event.results)
  .map((result: any) => result[0].transcript)
  .join(' ')
  .trim()
    setVoiceTranscript(transcript)
    setVoiceStatus(transcript ? '' : (bangla ? 'কথা বুঝতে পারিনি।' : 'Could not understand the speech.'))
  }

 recognition.onerror = (event: any) => {
  setVoiceStatus(`Voice error: ${event.error}`)
  }
  recognition.onend = () => {
  setVoiceStatus('')
}

  recognition.start()
}
const speakText = (message: string) => {
  window.speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(message)
  utterance.lang = bangla ? 'bn-BD' : 'en-US'

  window.speechSynthesis.speak(utterance)
}
 
 const reviewDemoDeed = async () => {
  const readField = (labels: string[]) => {
    const escapedLabels = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const match = ocrText.match(new RegExp(`(?:^|\\n)\\s*(?:${escapedLabels.join('|')})\\s*(?:[:：ঃ-])\\s*([^\\r\\n]+)`, 'im'))
    return match?.[1]?.trim()
  }

  const normalizeDigits = (value: string) => value.replace(/[০-৯]/g, (digit) => String('০১২৩৪৫৬৭৮৯'.indexOf(digit)))
  const mouza = readField(['Mouza', 'Mouja', 'মৌজা'])
  const dag = readField(['Dag', 'দাগ'])
  const khatian = readField(['Khatian', 'খতিয়ান', 'খতিয়ান'])
  const areaText = readField(['Area', 'Land area', 'জমির পরিমাণ', 'জমির পরিমান'])
  const areaDigits = areaText ? normalizeDigits(areaText) : ''
  const areaValue = areaDigits.match(/[0-9]+(?:[.,][0-9]+)?/)?.[0]?.replace(',', '.')
  const areaDecimal = areaValue ? Number.parseFloat(areaValue) : NaN

  const missingFields = [
    !mouza && (bangla ? 'মৌজা' : 'mouza'),
    !dag && (bangla ? 'দাগ' : 'dag'),
    !khatian && (bangla ? 'খতিয়ান' : 'khatian'),
    !Number.isFinite(areaDecimal) && (bangla ? 'জমির পরিমাণ' : 'area'),
  ].filter(Boolean)
  if (missingFields.length) {
    setDeedReviewResult(
      bangla
        ? `এই তথ্যগুলো পাওয়া যায়নি: ${missingFields.join(', ')}। OCR text ঠিক করে আবার চেষ্টা করুন।`
        : `Could not identify: ${missingFields.join(', ')}. Correct the extracted text and try again.`
    )
    return
  }

  setDeedReviewing(true)
  try {
    const response = await fetch(`${API_BASE}/document-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        land_id: deedLandId,
        mouza,
        dag,
        khatian,
        area_decimal: areaDecimal,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error('Review API request failed')
    }

    const selectedRecord = lands.find((land) => land.land_id === deedLandId)
    const selectedRecordLabel = selectedRecord ? `${selectedRecord.land_id} · ${selectedRecord.mouza}` : deedLandId
    const authenticityNote = bangla
      ? 'এটি শুধু synthetic demo record-এর সঙ্গে তুলনা; দলিলের সত্যতা বা মালিকানা যাচাই নয়। সরকারি রেকর্ডে যাচাই করুন।'
      : 'This only compares against a synthetic demo record; it does not verify authenticity or ownership. Confirm with official records.'
    if (data.status === 'no_mismatch_found') {
      setDeedReviewResult(
        bangla
          ? `পড়া তথ্য ${selectedRecordLabel} synthetic demo record-এর সঙ্গে মিলেছে। এটি দলিলের সত্যতা যাচাই করে না। সরকারি রেকর্ডে মিলিয়ে নিন।`
          : `Fields read from the image match the ${selectedRecordLabel} demo record. ${authenticityNote}`
      )
    } else {
      const fieldLabels: Record<string, string> = {
        mouza: bangla ? 'মৌজা' : 'mouza',
        dag: bangla ? 'দাগ' : 'dag',
        khatian: bangla ? 'খতিয়ান' : 'khatian',
        area_decimal: bangla ? 'জমির পরিমাণ' : 'area',
      }
      const mismatchList = data.mismatch_fields
        .map((field: string) => fieldLabels[field] ?? field)
        .join(', ')

      setDeedReviewResult(
        bangla
          ? `পর্যালোচনার সংকেত—অমিল পাওয়া গেছে: ${mismatchList}। এটি জালিয়াতির প্রমাণ নয়। সরকারি রেকর্ডে যাচাই করুন।`
          : `Review signal—mismatch found in: ${mismatchList}. This is not proof of fraud. ${authenticityNote}`
      )
    }
  } catch {
    setDeedReviewResult(
      bangla
        ? 'Review API-তে যোগাযোগ করা যায়নি। Backend চালু আছে কি না দেখুন।'
        : 'Could not reach the review API. Check that the backend is running.'
    )
  } finally {
    setDeedReviewing(false)
  }
}
  useEffect(() => {
    fetch(`${API_BASE}/land`)
      .then((response) => {
        if (!response.ok) throw new Error('API request failed')
        return response.json()
      })
      .then((data: Land[]) => {
        setLands(Array.isArray(data) ? data : demoLands)
        setApiError(false)
      })
      .catch(() => {
        setLands(demoLands)
        setApiError(true)
      })
      .finally(() => setLoading(false))
  }, [])

  const visibleLands = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return lands

    return lands.filter((land) => {
      const searchableFields = [
        land.land_id,
        land.mouza,
        land.khatian_number,
        String(land.dag_number),
        land.district,
        land.upazila,
      ].map((value) => value.toLocaleLowerCase())

      // Every search term must match somewhere in this land record.
      // This lets users combine a common mouza name with its district,
      // upazila, dag, or khatian to narrow down duplicate place names.
      return terms.every((term) => searchableFields.some((value) => value.includes(term)))
    })
  }, [lands, query])

  const dashboardLand = lands.find((land) => land.land_id === dashboardLandId) ?? lands[0]

  const text = bangla
    ? {
        dashboard: 'ড্যাশবোর্ড',
        search: 'জমি খুঁজুন',
        reports: 'যাচাই ও রিপোর্ট',
        laws: 'ভূমি আইন ও গাইড',
        faq: 'সাধারণ জিজ্ঞাসা',
        title: 'ভূমি ঝুঁকি ড্যাশবোর্ড',
        subtitle: 'জমির সম্ভাব্য ঝুঁকি বুঝুন, যাচাইয়ের আগে তথ্য দেখুন।',
        total: 'মোট ডেমো জমি',
        flagged: 'পর্যালোচনা দরকার',
        high: 'উচ্চ ঝুঁকির সূচক',
        records: 'জমির রেকর্ড',
        searchHint: 'Land ID, মৌজা, খতিয়ান বা দাগ দিয়ে খুঁজুন',
        searchPlaceholder: 'যেমন: BL-001 বা Greenpur',
        locationSearchHint: 'প্রথমে জেলা, উপজেলা ও মৌজা বেছে নিন; unique ID থাকলে শেষে দিন',
        locationSearchPlaceholder: 'Unique ID, দাগ বা খতিয়ান (ঐচ্ছিক)',
        demo: 'শুধু synthetic demo data। ঝুঁকির সংকেত fraud-এর প্রমাণ বা সরকারি যাচাই নয়।',
        low: 'কম ঝুঁকি',
        medium: 'মাঝারি ঝুঁকি',
        highLabel: 'উচ্চ ঝুঁকি',
        details: 'বিস্তারিত দেখুন',
        satellite: 'স্যাটেলাইট ভিউ দেখুন',
        close: 'বন্ধ করুন',
        verifyTitle: 'ডেমো রেকর্ড যাচাই',
        verifyHint: 'রেকর্ডের Land ID লিখে ডেমো তালিকায় খুঁজুন।',
        verifyButton: 'যাচাই করুন',
        lawsTitle: 'ভূমি আইন ও গাইড',
        lawsHint: 'এগুলো সাধারণ তথ্য; আপনার জমির আইনি পরামর্শ নয়।',
        apiFallback: 'Backend পাওয়া যায়নি—synthetic sample data দেখানো হচ্ছে।',
      }
    : {
        dashboard: 'Dashboard',
        search: 'Land Search',
        reports: 'Verification & Reports',
        laws: 'Land Laws & Guides',
        faq: 'Quick Help / FAQ',
        title: 'Land Risk Dashboard',
        subtitle: 'Review possible land-record risks before taking the next step.',
        total: 'Total demo lands',
        flagged: 'Records needing review',
        high: 'High-risk indicators',
        records: 'Land records',
        searchHint: 'Search by Land ID, mouza, khatian, or dag',
        searchPlaceholder: 'For example: BL-001 or Greenpur',
        locationSearchHint: 'Choose a district, upazila, and mouza first; add a unique ID if you have one',
        locationSearchPlaceholder: 'Unique ID, dag, or khatian (optional)',
        demo: 'Synthetic demo data only. Risk indicators are not proof of fraud or official verification.',
        low: 'Low risk',
        medium: 'Medium risk',
        highLabel: 'High risk',
        details: 'View details',
        satellite: 'View satellite',
        close: 'Close',
        verifyTitle: 'Demo record lookup',
        verifyHint: 'Enter a Land ID to find it in the demo list.',
        verifyButton: 'Check record',
        lawsTitle: 'Land laws & guides',
        lawsHint: 'General information only; this is not legal advice for your land.',
        apiFallback: 'Backend is unavailable; synthetic sample data is being shown.',
      }

  const currentPageTitle = page === 'dashboard' ? text.title
    : page === 'search' ? text.search
      : page === 'reports' ? text.reports
        : page === 'laws' ? text.laws
          : page === 'faq' ? text.faq
            : page === 'inheritance' ? (bangla ? 'উত্তরাধিকার হিসাব' : 'Inheritance Calculator')
              : page === 'buildability' ? (bangla ? 'নির্মাণ উপযোগিতা' : 'Build Suitability')
                : page === 'profile' ? (bangla ? 'ব্যবহারকারীর প্রোফাইল' : 'User profile')
                  : (bangla ? 'আমাদের সম্পর্কে' : 'About')

  const profileName = authUser
    ? [authUser.first_name, authUser.middle_name, authUser.last_name].filter(Boolean).join(' ') || authUser.identifier
    : continueAsDemo ? (bangla ? 'অতিথি ব্যবহারকারী' : 'Guest account') : (bangla ? 'অ্যাকাউন্ট' : 'Account')
  const profileInitials = authUser
    ? `${authUser.first_name.trim().charAt(0)}${authUser.last_name.trim().charAt(0)}`.toUpperCase()
    : 'G'
  const profileIdShort = authUser?.user_id ? authUser.user_id.slice(0, 8).toUpperCase() : continueAsDemo ? 'PROTOTYPE' : ''

  async function openPassport(land: Land) {
  setDashboardLandId(land.land_id)
  setLandEstimate(null)
  setLandEstimateId('')
  setSelectedLand(land)
  if (dashboardLandId === land.land_id) void loadLandEstimate(land)
  setPassport(null)

  try {
    const response = await fetch(
      `${API_BASE}/land/${encodeURIComponent(land.land_id)}/passport`,
    )
    if (!response.ok) throw new Error('Passport request failed')

    const data = await response.json()
    setPassport(data)
  } catch {
    setPassport({
      transfer_history: [],
      verification_token: '',
      integrity_status: 'unavailable',
      last_updated: 'Unavailable',
      disclaimer: 'Passport details could not be loaded. Check that the backend is running.',
    })
  }
} 
async function verifyPassport() {
  if (!passport?.verification_token) {
    setVerificationResult('Passport token is not available.')
    return
  }

  try {
    const response = await fetch(`${API_BASE}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: passport.verification_token }),
    })

    if (!response.ok) throw new Error('Verification request failed')

    const result = await response.json()
    setVerificationResult(
      result.record_exists && result.integrity_check_passed
        ? `Demo passport found for ${result.land_id}; integrity check passed.`
        : 'No matching demo passport was found.',
    )
  } catch {
    setVerificationResult('Could not reach the backend. Check that it is running.')
  }
}   
const loadLandEstimate = useCallback(async (land: Land) => {
  setLandEstimate(null)
  setLandEstimateId('')

  try {
    const response = await fetch(`${API_BASE}/land-value/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ land_id: land.land_id }),
    })

    if (!response.ok) throw new Error('Estimate request failed')

    const data = await response.json()
    setLandEstimate(data)
    setLandEstimateId(land.land_id)
  } catch {
    setLandEstimate(null)
    setLandEstimateId('')
  }
}, [])

useEffect(() => {
  if (dashboardLand) void loadLandEstimate(dashboardLand)
}, [dashboardLand?.land_id, loadLandEstimate])
  function downloadLandReport() {
  if (!selectedLand || !passport) return
  const report = [
    'BhumiLipi — Synthetic demo land report',
    `Land ID: ${selectedLand.land_id}`,
    `District: ${selectedLand.district}`,
    `Upazila: ${selectedLand.upazila}`,
    `Mouza: ${selectedLand.mouza}`,
    `Khatian: ${selectedLand.khatian_number}`,
    `Dag: ${selectedLand.dag_number}`,
    `Area: ${selectedLand.area_decimal} decimals`,
    `Owner reference: ${selectedLand.owner_ref}`,
    `Risk: ${selectedLand.risk_score}/100 (${selectedLand.risk_level})`,
    '',
    'Transfer history:',
    ...passport.transfer_history.map((item) => `${item.date} — ${item.event} (${item.reference})`),
    '',
    `Integrity: ${passport.integrity_status}`,
    `Last updated: ${passport.last_updated}`,
    `Passport verification: ${verificationResult || 'Not verified yet'}`,
    `Disclaimer: ${passport.disclaimer}`,
  ].join('\n')
  const file = new Blob([report], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = `${selectedLand.land_id}-demo-report.txt`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
  function printLandReportAsPdf() {
    if (!selectedLand || !passport) return
    const previousTitle = document.title
    document.title = `${selectedLand.land_id}-BhumiLipi-demo-report`
    window.addEventListener('afterprint', () => { document.title = previousTitle }, { once: true })
    window.print()
}
  function checkRecord() {
    const match = lands.find(
      (land) => land.land_id.toLowerCase() === verifyId.trim().toLowerCase(),
    )
    setVerifyResult(
      match
        ? `${match.land_id} — demo record found. This is not an official government verification.`
        : 'No matching demo record found.',
    )
  }

  if (!authToken && !continueAsDemo) {
    return (
      <main className={`account-welcome ${dark ? 'theme-dark' : ''}`}>
        <div className="account-welcome-motif" aria-hidden="true" />
        <header className="account-welcome-header">
          <div className="account-welcome-brand">
            <img className="brand-logo" src="/bhumilipi-logo.svg" alt="BhumiLipi" />
            <small>Land Risk Intelligence</small>
          </div>
          <div className="account-welcome-controls">
            <button type="button" onClick={() => setBangla((value) => !value)}>{bangla ? 'English' : 'বাংলা'}</button>
            <button type="button" onClick={() => setDark((value) => !value)}>{dark ? '☀ Light' : '◐ Dark'}</button>
          </div>
        </header>
        <div className="account-welcome-content">
          <section className="account-welcome-intro">
            <div className="eyebrow">BHUMILIPI · LAND MANAGEMENT</div>
            <h1>{bangla ? 'আপনার জমির তথ্য, এক জায়গায়' : 'Land information, in one place'}</h1>
            <p>{bangla ? 'চালিয়ে যেতে একটি account তৈরি করুন অথবা আপনার account-এ sign in করুন।' : 'Create an account or sign in to continue to BhumiLipi.'}</p>
            <div className="account-welcome-demo">{bangla ? 'ডেমোতে দেখানো জমি ও ঝুঁকির তথ্য synthetic; এগুলো সরকারি রেকর্ড নয়।' : 'Land and risk information in the demo is synthetic and is not an official record.'}</div>
          </section>
          <AccountPanel
            initialMode="register"
            bangla={bangla}
            standalone
            onClose={() => {}}
            onAuthenticated={(result) => {
              setAuthToken(result.access_token)
              setAuthUser(result.user)
              setContinueAsDemo(false)
              setPage('dashboard')
            }}
          />
          <button className="account-welcome-demo-link" type="button" onClick={() => { setContinueAsDemo(true); setPage('dashboard') }}>
            {bangla ? 'Guest হিসেবে prototype দেখুন' : 'Continue as guest'}
          </button>
          <small className="account-welcome-guest-note">{bangla ? 'শুধু prototype-এর visual দেখানোর জন্য' : 'For prototype visual only'}</small>
        </div>
      </main>
    )
  }

  return (
    <div className={`app-shell ${dark ? 'theme-dark' : ''} ${page === 'dashboard' ? 'dashboard-home' : ''} ${page === 'search' ? 'land-search-active' : ''}`}>
      <div className="app-background-motif" aria-hidden="true">
        <svg viewBox="0 0 520 520" focusable="false">
          <path className="motif-bangladesh" d="M315 44l30 12 22 24 28 9 14 22-5 25 17 18-7 26 18 14-8 29 15 24-17 28-22 10-6 30-25 17-9 34-31 5-19 27-27-9-20 13-23-11-22 10-11-24-24-3-6-26-21-11 4-28-18-16 9-22-9-23 19-17-5-27 23-12 5-30 24-3 11-25 29 2 20-18 22 11 21-13z" />
          <path className="motif-field" d="M65 391c90-58 187-72 390-45M49 427c118-70 241-77 427-50M31 465c145-81 280-89 450-54M15 500c135-69 282-91 478-61" />
          <path className="motif-river" d="M149 130c42 38 21 64 58 93s15 53 49 74 32 43 56 67" />
          <path className="motif-leaf" d="M393 103c-38 0-63 21-64 53 35 2 60-16 64-53zm-63 53c-1 25 12 43 35 50 5-24-7-43-35-50z" />
        </svg>
      </div>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #F7FAF7; color: #18352A; font-family: Inter, "Hind Siliguri", Arial, sans-serif; }
        button, input { font: inherit; }
        button { cursor: pointer; }
        .app-shell { min-height: 100vh; display: grid; grid-template-columns: 250px minmax(0, 1fr); }
        .sidebar { padding: 28px 18px; background: #F0F5EF; border-right: 1px solid #E1E9E1; }
        .brand { margin: 0 0 30px; color: #005830; font-size: 23px; font-weight: 700; }
        .brand small { display: block; margin-top: 5px; color: #617268; font-size: 12px; font-weight: 400; }
        .sidebar nav { display: grid; gap: 9px; }
        .sidebar nav button, .topbar button { text-align: left; border: 1px solid #E1E9E1; border-radius: 10px; background: white; color: #18352A; padding: 11px 13px; }
        .sidebar nav button:hover, .topbar button:hover { background: #EAF2E9; }
        .sidebar nav .nav-active { background: #005830; border-color: #005830; color: white; }
        .sidebar-note { margin-top: 25px; color: #617268; font-size: 13px; }
        .main-content { min-width: 0; padding: 24px clamp(18px, 4vw, 56px); }
        .topbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; padding-bottom: 18px; border-bottom: 1px solid #E1E9E1; }
        .topbar > span { font-size: 20px; font-weight: 600; }
        .topbar > div { display: flex; gap: 8px; }
        .page-intro { padding: 34px 0 22px; }
        .eyebrow { color: #005830; font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
        h1 { margin: 8px 0; font-size: clamp(30px, 4vw, 44px); }
        .page-intro p, .panel-heading p { color: #617268; }
        .demo-notice { margin: 12px 0 22px; padding: 14px 18px; border: 1px solid #e7d8a8; border-radius: 12px; background: #fff8df; color: #66521c; }
        .error-notice { border-color: #edc5a7; background: #fff0e5; color: #78411c; }
        .stats-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin: 22px 0 28px; }
        .stat-card { display: grid; gap: 10px; padding: 22px; border: 1px solid #E1E9E1; border-radius: 16px; background: white; box-shadow: 0 5px 18px #18352A0d; }
        .stat-card span { color: #617268; font-size: 14px; }
        .stat-card strong { color: #005830; font-size: 30px; }
        .records-panel, .tool-panel { margin-top: 22px; padding: 24px; border: 1px solid #E1E9E1; border-radius: 18px; background: white; box-shadow: 0 5px 18px #18352A0d; }
        .panel-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 18px; }
        .panel-heading h2 { margin: 0 0 6px; }
        .panel-heading p { margin: 0; }
        input { width: min(380px, 100%); padding: 12px 14px; border: 1px solid #E1E9E1; border-radius: 10px; outline-color: #005830; }
        .land-search-controls { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 18px; }
        .land-search-controls label { display: grid; align-content: start; gap: 7px; color: #18352A; font-weight: 600; }
        .land-search-controls select, .land-search-controls input { width: 100%; min-height: 46px; padding: 10px 12px; border: 1px solid #E1E9E1; border-radius: 9px; background: white; color: #18352A; font: inherit; }
        .search-guidance { grid-column: 1 / -1; margin: 0; padding: 11px 13px; border-radius: 9px; background: #EAF2E9; color: #617268; line-height: 1.55; }
        .land-list { display: grid; gap: 12px; }
        .land-result-group { display: grid; gap: 12px; }
        .land-card { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 17px; border: 1px solid #E1E9E1; border-radius: 13px; }
        .land-card-actions { display: grid; justify-items: end; gap: 8px; }
        .land-card-actions button { border: 1px solid #005830; border-radius: 9px; background: white; color: #005830; padding: 8px 11px; }
        .land-card-actions button:hover { background: #EAF2E9; }
        .theme-dark .land-card-actions button { background: #0B3825; color: #58A028; border-color: #58A028; }
        .land-card h3 { margin: 0 0 6px; color: #005830; }
        .land-card p { margin: 4px 0; color: #617268; }
        .risk-badge { flex: 0 0 auto; padding: 7px 10px; border-radius: 999px; background: #EAF2E9; color: #17633e; font-size: 13px; font-weight: 700; }
        .risk-high { background: #fde9e5; color: #a33126; }
        .risk-medium { background: #fff2d8; color: #805a0b; }
        .primary-button { border: 0; border-radius: 10px; background: #005830; color: white; padding: 12px 16px; }
        .primary-button:hover { background: #004830; }
        .inline-form { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
        .result-message { margin-top: 16px; padding: 13px; border-radius: 10px; background: #EAF2E9; }
        .guide-list { display: grid; gap: 12px; padding-left: 22px; line-height: 1.7; }
        .modal-backdrop { position: fixed; inset: 0; display: grid; place-items: center; padding: 20px; background: #10231dbb; z-index: 5; }
        .modal { width: min(560px, 100%); padding: 24px; border-radius: 18px; background: white; color: #18352A; }
        .modal { max-height: calc(100vh - 40px); overflow-y: auto; }
        .modal-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .modal-head h2 { margin: 0; }
        .modal p { line-height: 1.6; }
        .theme-dark { background: #06291C; color: #F4F8F4; }
        .theme-dark .sidebar { background: #0B3825; border-color: #2D563B; }
        .theme-dark .brand, .theme-dark .stat-card strong { color: #58A028; }
        .theme-dark .brand small, .theme-dark .sidebar-note, .theme-dark .page-intro p, .theme-dark .panel-heading p, .theme-dark .land-card p, .theme-dark .stat-card span { color: #B8CCBE; }
        .theme-dark .records-panel, .theme-dark .tool-panel, .theme-dark .stat-card, .theme-dark .land-card, .theme-dark .topbar button, .theme-dark input, .theme-dark .land-search-controls select { background: #0B3825; color: #F4F8F4; border-color: #2D563B; }
        .theme-dark .land-search-controls label { color: #F4F8F4; }
        .theme-dark .search-guidance { background: #0B3825; color: #B8CCBE; }
        .theme-dark .land-card h3 { color: #58A028; }
        .theme-dark .modal { background: #0B3825; color: #F4F8F4; }
        .theme-dark h1,
.theme-dark h2,
.theme-dark h3 {
  color: #F4F8F4;
}

.theme-dark .eyebrow {
  color: #58A028;
}

.theme-dark .sidebar nav button {
  background: #0B3825;
  color: #F4F8F4;
  border-color: #2D563B;
}

.theme-dark .sidebar nav button:hover {
  background: #123F2D;
}

.theme-dark .sidebar nav .nav-active {
  background: #005830;
  border-color: #005830;
  color: #fff;
}

button {
  transition: background-color 0.2s ease, color 0.2s ease,
    border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}

button:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 12px #18352A20;
}

button:active {
  transform: translateY(0) scale(0.98);
}
        @media (max-width: 760px) {
          .land-search-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .app-shell { grid-template-columns: 1fr; }
          .sidebar { padding: 18px; border-right: 0; border-bottom: 1px solid #E1E9E1; }
          .brand { margin-bottom: 16px; }
          .sidebar nav { display: flex; flex-wrap: wrap; }
          .sidebar nav button { flex: 1 1 145px; }
          .main-content { padding: 18px; }
          .stats-grid { grid-template-columns: 1fr; }
          .land-card { align-items: flex-start; flex-direction: column; }
        }
        @media (max-width: 560px) {
          .land-search-controls { grid-template-columns: 1fr; }
        }
      `}</style>

      <aside id="app-navigation" className={`sidebar ${navOpen ? 'is-open' : ''}`}>
        <div className="brand">
          <img className="brand-logo" src="/bhumilipi-logo.svg" alt="BhumiLipi" />
          <small>{bangla ? 'ভূমি তথ্য সহায়ক' : 'Land Risk Intelligence'}</small>
        </div>

        <nav aria-label="Main navigation">
          <button className={page === 'dashboard' ? 'nav-active' : ''} onClick={() => selectPage('dashboard')}>
            ▦ &nbsp; {text.dashboard}
          </button>
          <button className={page === 'search' ? 'nav-active' : ''} onClick={() => selectPage('search')}>
            ⌕ &nbsp; {text.search}
          </button>
          <button className={page === 'reports' ? 'nav-active' : ''} onClick={() => selectPage('reports')}>
            ◈ &nbsp; {text.reports}
          </button>
          <button className={page === 'inheritance' ? 'nav-active' : ''} onClick={() => selectPage('inheritance')}>
            {bangla ? 'উত্তরাধিকার হিসাব' : 'Inheritance Calculator'}
          </button>
          <button className={page === 'buildability' ? 'nav-active' : ''} onClick={() => selectPage('buildability')}>
            {bangla ? 'বাড়ি নির্মাণ বিশ্লেষণ' : 'Build Suitability'}
          </button>
          <button className={page === 'laws' ? 'nav-active' : ''} onClick={() => selectPage('laws')}>
            § &nbsp; {text.laws}
          </button>
          <button className={page === 'faq' ? 'nav-active' : ''} onClick={() => selectPage('faq')}>
            ? &nbsp; {text.faq}
          </button>
          <button className={page === 'about' ? 'nav-active' : ''} onClick={() => selectPage('about')}>
            <span>{bangla ? 'আমাদের সম্পর্কে' : 'About'}</span>
            <span className="about-info-icon" aria-hidden="true" title={bangla ? 'আমাদের সম্পর্কে' : 'About'}>i</span>
          </button>
        </nav>

        <p className="sidebar-note"><span className="sidebar-note-dot" />{bangla ? 'শুধু synthetic demo data' : 'Synthetic demo data only'}</p>
        <p className="sidebar-team-credit">Built by Vantage</p>

        <details className="account-menu">
          <summary>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.5-3.3 3.2-5.5 7-5.5s6.5 2.2 7 5.5" /></svg>
            <span>{authToken && authUser ? ([authUser.first_name, authUser.middle_name, authUser.last_name].filter(Boolean).join(' ') || authUser.identifier) : 'Account'}</span>
            <span className="account-chevron" aria-hidden="true">⌄</span>
          </summary>
          <div className="account-menu-options">
            <button type="button" onClick={logOutAccount}>{bangla ? 'Log out' : 'Log out'}</button>
          </div>
        </details>
      </aside>

      {navOpen && <button className="sidebar-backdrop" type="button" aria-label={bangla ? 'মেনু বন্ধ করুন' : 'Close navigation'} onClick={() => setNavOpen(false)} />}

      <main className="main-content">
        <header className="topbar">
          <button
            className="mobile-nav-toggle"
            type="button"
            aria-label={navOpen ? (bangla ? 'মেনু বন্ধ করুন' : 'Close menu') : (bangla ? 'মেনু খুলুন' : 'Open menu')}
            aria-controls="app-navigation"
            aria-expanded={navOpen}
            onClick={() => setNavOpen((isOpen) => !isOpen)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="topbar-context">
            <span className="topbar-kicker">BHUMILIPI / LAND SERVICES</span>
            <span className="topbar-title">{currentPageTitle}</span>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-action"
              type="button"
              title={bangla ? 'ভয়েস ইনপুট শুরু করুন' : 'Start voice input'}
              aria-label={bangla ? 'ভয়েস ইনপুট শুরু করুন' : 'Start voice input'}
              onClick={startVoiceInput}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3m-4 0h8" /></svg>
            </button>
            <button
              className="icon-action"
              type="button"
              title={bangla ? 'ট্রান্সক্রিপ্ট পড়ে শোনান' : 'Read transcript aloud'}
              aria-label={bangla ? 'ট্রান্সক্রিপ্ট পড়ে শোনান' : 'Read transcript aloud'}
              onClick={() => speakText(voiceTranscript)}
              disabled={!voiceTranscript}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z" /><path d="M16 9a5 5 0 0 1 0 6m2.5-8.5a8.5 8.5 0 0 1 0 11" /></svg>
            </button>
            <button aria-label={bangla ? 'Switch to English' : 'বাংলা ভাষায় পরিবর্তন করুন'} onClick={() => setBangla(!bangla)}>{bangla ? 'EN' : 'বাংলা'}</button>
            <button aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setDark(!dark)}>{dark ? '☀ Light' : '◐ Dark'}</button>
            <button className={`profile-trigger ${page === 'profile' ? 'is-active' : ''}`} type="button" onClick={() => selectPage('profile')} aria-label={bangla ? 'ব্যবহারকারীর প্রোফাইল খুলুন' : 'Open user profile'}>
              <span className="profile-avatar-mini" aria-hidden="true">
                {profilePhoto ? <img src={profilePhoto} alt="" /> : authUser ? profileInitials : <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.5-3.3 3.2-5.5 7-5.5s6.5 2.2 7 5.5" /></svg>}
              </span>
              <span className="profile-trigger-meta"><strong>{profileName}</strong><small>{profileIdShort ? `ID · ${profileIdShort}` : (bangla ? 'প্রোফাইল' : 'Profile')}</small></span>
            </button>
          </div>
        </header>

        {(voiceStatus || voiceTranscript) && (
          <div className="voice-feedback" role="status" aria-live="polite">
            <div>
              {voiceStatus && <p>{voiceStatus}</p>}
              {voiceTranscript && <p><strong>{bangla ? 'ট্রান্সক্রিপ্ট' : 'Transcript'}:</strong> {voiceTranscript}</p>}
            </div>
            <button type="button" aria-label={bangla ? 'ভয়েস বার্তা বন্ধ করুন' : 'Dismiss voice message'} onClick={() => { setVoiceStatus(''); setVoiceTranscript('') }}>×</button>
          </div>
        )}

        {page === 'profile' && (
          <div className="account-page-layout">
          <section className="profile-page">
            <div className="page-intro profile-page-intro">
              <span className="eyebrow">BHUMILIPI / ACCOUNT</span>
              <h1>{bangla ? 'আপনার প্রোফাইল' : 'Your profile'}</h1>
              <p>{bangla ? 'আপনার account-এর তথ্য এক জায়গায় দেখুন।' : 'View the information connected to your account.'}</p>
            </div>
            {authUser ? (
              <>
              <section className="profile-card">
                <div className="profile-card-heading">
                  <div className="profile-avatar-large">
                    {profilePhoto ? <img src={profilePhoto} alt={profileName} /> : <span>{profileInitials}</span>}
                  </div>
                  <div className="profile-card-identity">
                    <span className="section-kicker">{bangla ? 'ACCOUNT PROFILE' : 'ACCOUNT PROFILE'}</span>
                    <h2>{profileName}</h2>
                    <small>{bangla ? 'ব্যবহারকারী ID' : 'User ID'} · {authUser.user_id}</small>
                  </div>
                  <div className="profile-photo-actions">
                    <label className="profile-upload-button">
                      {profilePhoto ? (bangla ? 'ছবি বদলান' : 'Change photo') : (bangla ? 'ছবি যোগ করুন' : 'Add photo')}
                      <input type="file" accept="image/*" onChange={handleProfilePhotoChange} />
                    </label>
                    {profilePhoto && <button type="button" className="profile-remove-button" onClick={removeProfilePhoto}>{bangla ? 'ছবি সরান' : 'Remove photo'}</button>}
                  </div>
                </div>
                <div className="profile-info-grid">
                  <article><span>{bangla ? 'নাম' : 'Full name'}</span><strong>{profileName}</strong></article>
                  <article><span>{authUser.method === 'email' ? (bangla ? 'ইমেইল ঠিকানা' : 'Email address') : (bangla ? 'ফোন নম্বর' : 'Phone number')}</span><strong>{authUser.identifier}</strong></article>
                  <article><span>{bangla ? 'যাচাইকরণের মাধ্যম' : 'Verified sign-in method'}</span><strong>{authUser.method === 'email' ? (bangla ? 'ইমেইল OTP' : 'Email OTP') : (bangla ? 'ফোন OTP' : 'Phone OTP')}</strong></article>
                  <article><span>{bangla ? 'নিবন্ধিত নাম' : 'Name on account'}</span><strong>{[authUser.first_name, authUser.middle_name, authUser.last_name].filter(Boolean).join(' ')}</strong></article>
                  <article className="profile-id-field"><span>{bangla ? 'ব্যবহারকারী ID' : 'User ID'}</span><strong>{authUser.user_id}</strong></article>
                </div>
                <p className="profile-photo-note">{profilePhotoMessage || (bangla ? 'Profile photo optional। ছবিটি শুধু এই browser-এ রাখা হয়, server-এ upload হয় না।' : 'Profile photo is optional. It stays in this browser and is not uploaded to the server.')}</p>
              </section>
              <div className="profile-settings-grid">
                <details className="profile-settings-section">
                  <summary>{bangla ? 'যোগাযোগের তথ্য' : 'Contact information'}<span aria-hidden="true">⌄</span></summary>
                  <div className="profile-settings-body">
                    <p>{bangla ? 'নতুন email বা phone number OTP দিয়ে যাচাই হলে account-এর যোগাযোগের তথ্য বদলাবে।' : 'Your account contact changes only after the new email or phone is verified by OTP.'}</p>
                    {!contactCodeStage ? (
                      <form className="profile-settings-form" onSubmit={(event) => { event.preventDefault(); void requestContactCode() }}>
                        <label>{bangla ? 'নতুন email অথবা phone number' : 'New email or phone number'}<input type="text" autoComplete="email" value={contactIdentifier} onChange={(event) => setContactIdentifier(event.target.value)} placeholder="name@example.com or +8801…" required /></label>
                        <label>{bangla ? 'বর্তমান password' : 'Current password'}<input type="password" autoComplete="current-password" minLength={8} value={contactPassword} onChange={(event) => setContactPassword(event.target.value)} required /></label>
                        <button className="primary-button" type="submit" disabled={accountSettingsBusy}>{accountSettingsBusy ? (bangla ? 'অপেক্ষা করুন…' : 'Please wait…') : (bangla ? 'OTP পাঠান' : 'Send verification code')}</button>
                      </form>
                    ) : (
                      <form className="profile-settings-form" onSubmit={(event) => void verifyContactCode(event)}>
                        <p className="profile-settings-current-contact">{bangla ? 'যাচাইয়ের code পাঠানো হয়েছে:' : 'Verification code sent to:'} <strong>{contactIdentifier}</strong></p>
                        <label>{bangla ? '৬ সংখ্যার verification code' : '6-digit verification code'}<input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={contactCode} onChange={(event) => setContactCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required /></label>
                        <div className="profile-settings-actions"><button className="primary-button" type="submit" disabled={accountSettingsBusy || contactCode.length !== 6}>{bangla ? 'যাচাই করে update করুন' : 'Verify and update'}</button><button type="button" className="profile-text-button" disabled={accountSettingsBusy || contactResendSeconds > 0} onClick={() => void requestContactCode()}>{contactResendSeconds ? `${contactResendSeconds}s` : (bangla ? 'আবার code পাঠান' : 'Resend code')}</button><button type="button" className="profile-text-button" onClick={() => { setContactCodeStage(false); setContactCode('') }}>{bangla ? 'বাতিল' : 'Cancel'}</button></div>
                      </form>
                    )}
                  </div>
                </details>

                <details className="profile-settings-section">
                  <summary>{bangla ? 'নিরাপত্তা' : 'Security'}<span aria-hidden="true">⌄</span></summary>
                  <div className="profile-settings-body">
                    <form className="profile-settings-form" onSubmit={(event) => void handlePasswordChange(event)}>
                      <h3>{bangla ? 'Password পরিবর্তন' : 'Change password'}</h3>
                      <label>{bangla ? 'বর্তমান password' : 'Current password'}<input type="password" autoComplete="current-password" minLength={8} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
                      <label>{bangla ? 'নতুন password' : 'New password'}<input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
                      <label>{bangla ? 'নতুন password আবার লিখুন' : 'Confirm new password'}<input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} required /></label>
                      <button className="primary-button" type="submit" disabled={accountSettingsBusy}>{bangla ? 'Password পরিবর্তন করুন' : 'Update password'}</button>
                    </form>
                    <div className="profile-security-session"><div><strong>{bangla ? 'সব device থেকে sign out' : 'Sign out from all devices'}</strong><p>{bangla ? 'অন্য device-এ খোলা session-গুলো বন্ধ হবে; এই device-ও sign out হবে।' : 'This signs out every active session, including this device.'}</p></div><button type="button" className="profile-secondary-button" disabled={accountSettingsBusy} onClick={() => void signOutAllDevices()}>{bangla ? 'সব device থেকে sign out' : 'Sign out everywhere'}</button></div>
                  </div>
                </details>

                <details className="profile-settings-section">
                  <summary>{bangla ? 'পছন্দ' : 'Preferences'}<span aria-hidden="true">⌄</span></summary>
                  <div className="profile-settings-body">
                    <div className="profile-preference-row"><div><strong>{bangla ? 'ভাষা' : 'Language'}</strong><p>{bangla ? 'বাংলা' : 'English'}</p></div><button type="button" className="profile-secondary-button" onClick={() => setBangla((value) => !value)}>{bangla ? 'English' : 'বাংলা'}</button></div>
                    <div className="profile-preference-row"><div><strong>{bangla ? 'রঙের mode' : 'Colour mode'}</strong><p>{dark ? (bangla ? 'Dark mode' : 'Dark mode') : (bangla ? 'Light mode' : 'Light mode')}</p></div><button type="button" className="profile-secondary-button" onClick={() => setDark((value) => !value)}>{dark ? (bangla ? 'Light mode' : 'Light mode') : (bangla ? 'Dark mode' : 'Dark mode')}</button></div>
                    <p className="profile-photo-note">{bangla ? 'এই পছন্দগুলো এই browser-এ সংরক্ষিত থাকে।' : 'These preferences are saved in this browser.'}</p>
                  </div>
                </details>

                <details className="profile-settings-section profile-privacy-section">
                  <summary>{bangla ? 'গোপনীয়তা ও account মুছুন' : 'Privacy and account deletion'}<span aria-hidden="true">⌄</span></summary>
                  <div className="profile-settings-body">
                    <div className="profile-privacy-note"><strong>{bangla ? 'আপনার account-এ কী রাখা হয়' : 'What your account stores'}</strong><p>{bangla ? 'নাম, User ID, যাচাইকৃত email/phone, verification-এর সময় এবং salted password hash। আসল password সংরক্ষণ করা হয় না। NID নেওয়া হয় না। Profile photo শুধু এই browser-এ থাকে।' : 'Your name, User ID, verified email/phone, verification timestamps, and a salted password hash. The raw password is never stored. BhumiLipi does not collect your NID. Your profile photo stays in this browser.'}</p></div>
                    <form className="profile-settings-form profile-delete-form" onSubmit={(event) => void deleteAccount(event)}>
                      <h3>{bangla ? 'স্থায়ীভাবে account মুছুন' : 'Permanently delete account'}</h3>
                      <p>{bangla ? 'এতে আপনার account এবং sign-in তথ্য মুছে যাবে। এই কাজ ফিরিয়ে নেওয়া যাবে না।' : 'This permanently removes your account and sign-in details. This action cannot be undone.'}</p>
                      <label>{bangla ? 'বর্তমান password' : 'Current password'}<input type="password" autoComplete="current-password" minLength={8} value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} required /></label>
                      <label>{bangla ? 'নিশ্চিত করতে DELETE লিখুন' : 'Type DELETE to confirm'}<input type="text" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} required /></label>
                      <button className="profile-danger-button" type="submit" disabled={accountSettingsBusy || deleteConfirmation !== 'DELETE'}>{bangla ? 'Account স্থায়ীভাবে মুছুন' : 'Delete account permanently'}</button>
                    </form>
                  </div>
                </details>
              </div>
              {accountSettingsMessage && <p className="account-settings-feedback" role="status">{accountSettingsMessage}</p>}
              </>
            ) : (
              <section className="profile-card profile-guest-card">
                <div className="profile-avatar-large"><span>G</span></div>
                <div><h2>{bangla ? 'Guest mode' : 'Guest mode'}</h2><p>{bangla ? 'আপনি prototype visual mode ব্যবহার করছেন। এখানে কোনো ব্যক্তিগত account তথ্য সংরক্ষিত নেই।' : 'You are viewing the prototype in guest mode. No personal account information is stored here.'}</p></div>
                <span className="profile-prototype-id">{bangla ? 'Demo ID' : 'Demo ID'} · PROTOTYPE</span>
              </section>
            )}
          </section>
          <aside className="dashboard-assistant-card account-assistant-card">
            <div className="assistant-card-heading"><span className="assistant-orbit" aria-hidden="true">✳</span><span>{bangla ? 'সহায়তা প্রয়োজন?' : 'NEED A HAND?'}</span></div>
            <AssistantPanel bangla={bangla} />
          </aside>
          </div>
        )}

        {page === 'dashboard' && (
          <div className="dashboard-page">
            <section className="dashboard-hero">
              <div>
                <span className="eyebrow">BHUMILIPI <span>·</span> DEMO</span>
                <h1>{bangla ? 'জমির তথ্য, এক নজরে' : 'Your land, at a glance'}</h1>
                <p>{bangla ? 'নমুনা রেকর্ড খুঁজুন, ঝুঁকির সংকেত দেখুন এবং দামের সম্ভাব্য দৃশ্যপট বুঝুন।' : 'Find a sample record, review its risk signal, and explore an illustrative price outlook.'}</p>
              </div>
              <section className="demo-record-summary" aria-label={bangla ? 'সিন্থেটিক ডেমো রেকর্ডের সংখ্যা' : 'Synthetic demo record count'}>
                <div><span>{bangla ? 'সিন্থেটিক ডেমো রেকর্ড' : 'SYNTHETIC DEMO RECORDS'}</span><strong>{loading ? '—' : lands.length}</strong><small>{bangla ? 'টি জমির রেকর্ড' : 'sample land records'}</small></div>
                <button type="button" onClick={() => selectPage('search')} aria-label={bangla ? 'সব ডেমো রেকর্ড দেখুন' : 'Browse all demo records'}>↗</button>
              </section>
            </section>

            {apiError && <div className="demo-notice error-notice">{text.apiFallback}</div>}

            <div className="dashboard-grid">
              <div className="dashboard-primary-column">
                <section className="dashboard-card dashboard-search-card">
                  <div className="dashboard-section-heading">
                    <div><span className="section-kicker">01 / {bangla ? 'খুঁজুন' : 'FIND'}</span><h2>{bangla ? 'নমুনা জমি খুঁজুন' : 'Find sample land'}</h2></div>
                    <span className="sample-label">{bangla ? 'ডেমো রেকর্ড' : 'DEMO RECORDS'}</span>
                  </div>
                  <label className="dashboard-search-field">
                    <span aria-hidden="true">⌕</span>
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={bangla ? 'Land ID, মৌজা, খতিয়ান বা দাগ দিয়ে খুঁজুন' : 'Search by Land ID, mouza, khatian, or dag'} aria-label={text.searchHint} />
                  </label>
                  <div className="dashboard-results" aria-live="polite">
                    {loading ? <p className="dashboard-empty">{bangla ? 'নমুনা রেকর্ড লোড হচ্ছে…' : 'Loading sample records…'}</p> : visibleLands.length === 0 ? <p className="dashboard-empty">{bangla ? 'কোনো রেকর্ড মেলেনি। অন্য শব্দ দিয়ে খুঁজুন।' : 'No records matched. Try another search.'}</p> : visibleLands.map((land) => (
                      <button type="button" className={`dashboard-result ${dashboardLand?.land_id === land.land_id ? 'is-selected' : ''}`} key={land.land_id} onClick={() => { setDashboardLandId(land.land_id); setQuery('') }}>
                        <span className="result-land-id">{land.land_id}</span><span className="result-land-place">{land.mouza}, {land.district}</span><span className="result-arrow" aria-hidden="true">↗</span>
                      </button>
                    ))}
                  </div>
                </section>

                {dashboardLand && (
                  <section className="dashboard-card dashboard-summary-card">
                    <div className="dashboard-section-heading">
                      <div><span className="section-kicker">02 / {bangla ? 'সংক্ষিপ্ত পরিচিতি' : 'OVERVIEW'}</span><h2>{bangla ? 'নির্বাচিত নমুনা জমি' : 'Selected sample land'}</h2></div>
                      <label className="summary-selector-label"><span className="sr-only">{bangla ? 'নমুনা জমি নির্বাচন করুন' : 'Select sample land'}</span><select value={dashboardLand.land_id} onChange={(event) => setDashboardLandId(event.target.value)} aria-label={bangla ? 'নমুনা জমি নির্বাচন করুন' : 'Select sample land'}>{lands.map((land) => <option key={land.land_id} value={land.land_id}>{land.land_id}</option>)}</select></label>
                    </div>
                    <div className="land-overview">
                      <div className="land-overview-main">
                        <span className="land-location-mark" aria-hidden="true">⌖</span>
                        <div><h3>{dashboardLand.mouza}</h3><p>{dashboardLand.upazila}, {dashboardLand.district}</p></div>
                      </div>
                      <div className={`risk-indicator risk-${dashboardLand.risk_score >= 60 ? 'high' : dashboardLand.risk_score >= 35 ? 'medium' : 'low'}`}>
                        <span>{bangla ? 'ঝুঁকির সূচক' : 'Risk indicator'}</span>
                        <strong>{dashboardLand.risk_score}<small>/100</small></strong>
                        <span className="risk-level-label">{bangla ? (dashboardLand.risk_score >= 60 ? 'উচ্চ' : dashboardLand.risk_score >= 35 ? 'মাঝারি' : 'কম') : (dashboardLand.risk_score >= 60 ? 'High' : dashboardLand.risk_score >= 35 ? 'Medium' : 'Low')}</span>
                        <span className="risk-track"><i style={{ width: `${Math.max(0, Math.min(100, dashboardLand.risk_score))}%` }} /></span>
                      </div>
                    </div>
                    <div className="land-facts-grid">
                      <div><span>{bangla ? 'দাগ নম্বর' : 'Dag number'}</span><strong>{dashboardLand.dag_number}</strong></div>
                      <div><span>{bangla ? 'খতিয়ান' : 'Khatian'}</span><strong>{dashboardLand.khatian_number}</strong></div>
                      <div><span>{bangla ? 'জমির পরিমাণ' : 'Land area'}</span><strong>{dashboardLand.area_decimal} {bangla ? 'শতাংশ' : 'decimal'}</strong></div>
                    </div>
                    {dashboardLand.risk_factors && dashboardLand.risk_factors.length > 0 && <div className="risk-factors"><span>{bangla ? 'পর্যালোচনার সংকেত' : 'Review signals'}</span><p>{dashboardLand.risk_factors.join(' · ')}</p></div>}
                    <p className="summary-demo-note">{bangla ? 'এই ঝুঁকির সংকেত synthetic demo record থেকে এসেছে; এটি জালিয়াতির প্রমাণ বা সরকারি যাচাই নয়।' : 'This signal comes from a synthetic demo record; it is not proof of fraud or official verification.'}</p>
                    <button className="summary-details-button" type="button" onClick={() => void openPassport(dashboardLand)}>{bangla ? 'সম্পূর্ণ রেকর্ড দেখুন' : 'Open full record'} <span aria-hidden="true">↗</span></button>
                  </section>
                )}

                <section className="dashboard-card dashboard-outlook-card">
                  <div className="dashboard-section-heading">
                    <div><span className="section-kicker">03 / {bangla ? 'দামের দৃশ্যপট' : 'PRICE OUTLOOK'}</span><h2>{bangla ? 'সম্ভাব্য দামের দৃশ্যপট' : 'Illustrative price outlook'}</h2></div>
                    {dashboardLand && <span className="outlook-land-tag">{dashboardLand.land_id}</span>}
                  </div>
                  {landEstimate && dashboardLand && landEstimateId === dashboardLand.land_id
                    ? <PriceProjectionChart estimate={landEstimate} bangla={bangla} />
                    : <p className="dashboard-empty">{apiError ? (bangla ? 'দামের estimate পেতে backend চালু করুন।' : 'Start the backend to load the demo price estimate.') : (bangla ? 'দামের estimate লোড হচ্ছে…' : 'Loading the demo price estimate…')}</p>}
                </section>

                <section className="dashboard-card dashboard-quick-access">
                  <div className="dashboard-section-heading"><div><span className="section-kicker">04 / {bangla ? 'দ্রুত প্রবেশ' : 'SHORTCUTS'}</span><h2>{bangla ? 'Quick Access' : 'Quick access'}</h2></div></div>
                  <div className="quick-access-grid">
                    {[
                      { page: 'search' as Page, title: bangla ? 'জমি খুঁজুন' : 'Land search', hint: bangla ? 'এলাকাভিত্তিক রেকর্ড' : 'Browse by location', mark: '⌕' },
                      { page: 'reports' as Page, title: bangla ? 'যাচাই ও রিপোর্ট' : 'Review & reports', hint: bangla ? 'ডেমো দলিল পর্যালোচনা' : 'Review demo deeds', mark: '↗' },
                      { page: 'laws' as Page, title: bangla ? 'আইন ও গাইড' : 'Laws & guides', hint: bangla ? 'সাধারণ নির্দেশনা' : 'General guidance', mark: '§' },
                      { page: 'inheritance' as Page, title: bangla ? 'উত্তরাধিকার হিসাব' : 'Inheritance', hint: bangla ? 'সীমিত শিক্ষামূলক হিসাব' : 'Limited educational estimate', mark: '◇' },
                      { page: 'buildability' as Page, title: bangla ? 'নির্মাণ উপযোগিতা' : 'Build suitability', hint: bangla ? 'প্রাথমিক soil-test status' : 'Preliminary soil-test status', mark: '⌂' },
                      { page: 'faq' as Page, title: bangla ? 'সাধারণ জিজ্ঞাসা' : 'Quick help', hint: bangla ? 'প্রশ্ন ও উত্তর খুঁজুন' : 'Find answers', mark: '?' },
                    ].map((item) => <button type="button" className="quick-access-link" key={item.page} onClick={() => setPage(item.page)}><span className="quick-access-mark" aria-hidden="true">{item.mark}</span><span><strong>{item.title}</strong><small>{item.hint}</small></span><span className="result-arrow" aria-hidden="true">↗</span></button>)}
                  </div>
                </section>
              </div>

              <aside className="dashboard-assistant-card">
                <div className="assistant-card-heading"><span className="assistant-orbit" aria-hidden="true">✳</span><span>{bangla ? 'সাহায্য প্রয়োজন?' : 'NEED A HAND?'}</span></div>
                <AssistantPanel bangla={bangla} />
              </aside>
            </div>
          </div>
        )}

        {page === 'search' && (
          <div className="land-search-page">
            <div className="land-search-workspace-main">
              <section className="page-intro">
                <div className="eyebrow">BHUMILIPI · DEMO</div>
                <h1>{text.search}</h1>
                <p>{text.searchHint}</p>
              </section>
              <div className="demo-notice">{text.demo}</div>
              <LandList
                lands={lands}
                query=""
                setQuery={setQuery}
                loading={loading}
                text={text}
                onSelect={(land) => { setSearchDetailsLandId(land.land_id); void openPassport(land) }}
                onViewSatellite={setSatelliteLand}
                satelliteLand={satelliteLand}
                bangla={bangla}
                onCloseSatellite={() => setSatelliteLand(null)}
                inlineDetails
              />
              {selectedLand && searchDetailsLandId === selectedLand.land_id && <section ref={searchDetailsRef} className="land-search-full-record" aria-live="polite">
                <div className="eyebrow">{bangla ? 'সম্পূর্ণ ডেমো রেকর্ড' : 'FULL DEMO RECORD'}</div>
                <div className="land-search-full-record-heading">
                  <div><h2>{selectedLand.land_id} · {selectedLand.mouza}</h2><p>{selectedLand.upazila}, {selectedLand.district}</p></div>
                  <span className={`risk-badge risk-${selectedLand.risk_score >= 60 ? 'high' : selectedLand.risk_score >= 35 ? 'medium' : 'low'}`}>{bangla ? 'ঝুঁকি' : 'Risk'}: {selectedLand.risk_score}/100 · {selectedLand.risk_level ?? text.medium}</span>
                </div>
                <dl className="land-search-full-record-facts">
                  <div><dt>{bangla ? 'দাগ নম্বর' : 'Dag number'}</dt><dd>{selectedLand.dag_number}</dd></div>
                  <div><dt>{bangla ? 'খতিয়ান' : 'Khatian'}</dt><dd>{selectedLand.khatian_number}</dd></div>
                  <div><dt>{bangla ? 'জমির পরিমাণ' : 'Land area'}</dt><dd>{selectedLand.area_decimal} decimal</dd></div>
                  <div><dt>{bangla ? 'মালিকের রেফারেন্স' : 'Owner reference'}</dt><dd>{selectedLand.owner_ref}</dd></div>
                </dl>
                <p><strong>{bangla ? 'পর্যালোচনার সংকেত' : 'Review signals'}:</strong> {selectedLand.risk_factors?.join(' · ') || (bangla ? 'কোনো ঝুঁকির কারণ তালিকাভুক্ত নেই।' : 'No risk factors listed.')}</p>
                {passport ? <>
                  <h3>{bangla ? 'হস্তান্তরের ইতিহাস' : 'Transfer history'}</h3>
                  {passport.transfer_history.length ? passport.transfer_history.map((item) => <p key={item.reference}><strong>{item.date}</strong> · {item.event} ({item.reference})</p>) : <p>{bangla ? 'এই ডেমো পাসপোর্টে হস্তান্তরের তথ্য নেই।' : 'No transfer events are listed in this demo passport.'}</p>}
                  <p><strong>{bangla ? 'তথ্যের অখণ্ডতা' : 'Integrity'}:</strong> {passport.integrity_status} · <strong>{bangla ? 'সর্বশেষ হালনাগাদ' : 'Last updated'}:</strong> {passport.last_updated}</p>
                  {passport.disclaimer && <p className="land-search-record-disclaimer">{passport.disclaimer}</p>}
                  <div className="land-search-record-actions">
                    <button type="button" className="primary-button" onClick={downloadLandReport}>{bangla ? 'ডেমো রিপোর্ট ডাউনলোড' : 'Download demo report'}</button>
                    <button type="button" className="primary-button" onClick={verifyPassport}>{bangla ? 'ডেমো পাসপোর্ট যাচাই' : 'Verify demo passport'}</button>
                  </div>
                  {verificationResult && <p className="result-message">{verificationResult}</p>}
                </> : <p>{bangla ? 'পাসপোর্টের তথ্য লোড হচ্ছে…' : 'Loading passport details…'}</p>}
                <div className="demo-notice">{text.demo}</div>
              </section>}
            </div>
            <aside className="dashboard-assistant-card land-search-assistant-card">
              <div className="assistant-card-heading"><span className="assistant-orbit" aria-hidden="true">✳</span><span>{bangla ? 'সহায়তা প্রয়োজন?' : 'NEED A HAND?'}</span></div>
              <AssistantPanel bangla={bangla} />
            </aside>
          </div>
        )}

        {page === 'reports' && (
          <div className="reports-page">
            <div className="reports-main">
            <section className="page-intro">
              <div className="eyebrow">BHUMILIPI · DEMO</div>
              <h1>{text.reports}</h1>
              <p>{text.demo}</p>
            </section>
            <section className="tool-panel">
  <h2>{bangla ? 'দলিল ও জমির ঝুঁকির সারসংক্ষেপ' : 'Document & Land Risk Overview'}</h2>
  <p>
    {bangla
      ? 'শুধু synthetic demo দলিল ব্যবহার করুন। এটি আইনি সত্যতা যাচাই নয়।'
      : 'Use synthetic demo deeds only. This does not certify legal authenticity.'}
  </p>

  <label htmlFor="deed-land-id">
  {bangla ? 'যে জমির রেকর্ডের সঙ্গে মিলাবেন' : 'Land record to compare'}
</label>

<select
  id="deed-land-id"
  value={deedLandId}
  onChange={(event) => {
    setDeedLandId(event.target.value)
    setDeedReviewResult('')
  }}
>
  {lands.map((land) => (
    <option key={land.land_id} value={land.land_id}>
      {land.land_id}
    </option>
  ))}
</select>

 <label htmlFor="deed-image">
  {bangla ? 'Synthetic দলিলের ছবি বেছে নিন' : 'Choose a synthetic deed image'}
</label>
 <p className="field-hint">{bangla
   ? 'ছবি এই browser-এ পড়া হয়। শুধু পড়া text নির্বাচিত synthetic demo record-এর সঙ্গে তুলনা করা হয়; এটি সরকারি যাচাই নয়।'
   : 'The image is read in this browser. Only extracted text is compared with the selected synthetic demo record; this is not official verification.'}</p>

<input
  id="deed-image"
  type="file"
  accept="image/*"
  aria-label="Upload synthetic deed image"
  onChange={(event) => {
    setDeedFile(event.target.files?.[0] ?? null)
    setOcrText('')
    setOcrConfidence(null)
    setDeedReviewResult('')
  }}
/>

{deedFile && <p>{deedFile.name}</p>}

<button className="primary-button" onClick={scanDeedImage}>
  {bangla ? 'ছবি থেকে লেখা পড়ুন' : 'Read text from image'}
</button>

{ocrText && <>
  {ocrConfidence !== null && <p className="field-hint">OCR confidence: {Math.round(ocrConfidence)}%{ocrConfidence < 60 ? (bangla ? ' · কম confidence—text মিলিয়ে নিন' : ' · low confidence; review the text') : ''}</p>}
  <label htmlFor="deed-ocr-text">{bangla ? 'পড়া text যাচাই/সংশোধন করুন' : 'Review or correct extracted text'}</label>
  <textarea id="deed-ocr-text" rows={7} value={ocrText} onChange={(event) => { setOcrText(event.target.value); setDeedReviewResult('') }} />
</>}
{ocrText && (
  <button className="primary-button" onClick={reviewDemoDeed} disabled={deedReviewing}>
    {deedReviewing ? (bangla ? 'তুলনা করা হচ্ছে…' : 'Comparing…') : (bangla ? 'ডেমো রেকর্ডের সঙ্গে তুলনা করুন' : 'Compare with demo record')}
  </button>
)}

{deedReviewResult && (
  <p className="result-message">{deedReviewResult}</p>
)}
</section>
           <section className="tool-panel">
              <h2>{text.verifyTitle}</h2>
              <p>{text.verifyHint}</p>
              <div className="inline-form">
                <input  value={verifyId} onChange={(event) => setVerifyId(event.target.value)} placeholder="BL-001" aria-label="Land ID" />
                <button className="primary-button" onClick={checkRecord}>{text.verifyButton}</button>
              </div>
              {verifyResult && <div className="result-message">{verifyResult}</div>}
            </section>
            <LandList
              lands={lands.filter((land) => land.risk_score >= 50)}
              query=""
              setQuery={setQuery}
              loading={loading}
              text={text}
              onSelect={(land) => {
                setReportsDetailsLandId(land.land_id)
                void openPassport(land)
                if (dashboardLandId !== land.land_id) void loadLandEstimate(land)
              }}
            />
            {selectedLand && reportsDetailsLandId === selectedLand.land_id && <section id="land-report-print" className="tool-panel reports-land-details" aria-live="polite">
              <div className="reports-land-details-heading">
                <div>
                  <div className="eyebrow">{bangla ? 'নির্বাচিত ডেমো রেকর্ড' : 'SELECTED DEMO RECORD'}</div>
                  <h2>{selectedLand.land_id} · {selectedLand.mouza}</h2>
                  <p>{selectedLand.upazila}, {selectedLand.district}</p>
                </div>
                <button type="button" className="reports-details-close" onClick={() => setReportsDetailsLandId('')}>{text.close}</button>
              </div>
              <dl className="reports-land-facts">
                <div><dt>{bangla ? 'দাগ নম্বর' : 'Dag number'}</dt><dd>{selectedLand.dag_number}</dd></div>
                <div><dt>{bangla ? 'খতিয়ান' : 'Khatian'}</dt><dd>{selectedLand.khatian_number}</dd></div>
                <div><dt>{bangla ? 'জমির পরিমাণ' : 'Land area'}</dt><dd>{selectedLand.area_decimal} {bangla ? 'ডেসিমেল' : 'decimal'}</dd></div>
                <div><dt>{bangla ? 'মালিকের রেফারেন্স' : 'Owner reference'}</dt><dd>{selectedLand.owner_ref}</dd></div>
                <div><dt>{bangla ? 'ঝুঁকির সংকেত' : 'Risk signal'}</dt><dd>{selectedLand.risk_score}/100 · {selectedLand.risk_level ?? text.medium}</dd></div>
              </dl>
              <p><strong>{bangla ? 'পর্যালোচনার সংকেত' : 'Review signals'}:</strong> {selectedLand.risk_factors?.join(' · ') || (bangla ? 'কোনো ঝুঁকির কারণ তালিকাভুক্ত নেই।' : 'No risk factors are listed.')}</p>
              {passport ? <>
                <h3>{bangla ? 'হস্তান্তরের ইতিহাস' : 'Transfer history'}</h3>
                {passport.transfer_history.length ? passport.transfer_history.map((item) => <p key={item.reference}><strong>{item.date}</strong> · {item.event} ({item.reference})</p>) : <p>{bangla ? 'এই ডেমো পাসপোর্টে হস্তান্তরের তথ্য নেই।' : 'No transfer events are listed in this demo passport.'}</p>}
                <p><strong>{bangla ? 'তথ্যের অখণ্ডতা' : 'Integrity'}:</strong> {passport.integrity_status} · <strong>{bangla ? 'সর্বশেষ হালনাগাদ' : 'Last updated'}:</strong> {passport.last_updated}</p>
                {passport.disclaimer && <p className="reports-record-disclaimer">{passport.disclaimer}</p>}
              </> : <p>{bangla ? 'পাসপোর্টের তথ্য লোড হচ্ছে…' : 'Loading passport details…'}</p>}
              {landEstimate && landEstimateId === selectedLand.land_id ? <div className="reports-price-graph">
                <div className="reports-price-summary">
                  <strong>{bangla ? 'আনুমানিক বর্তমান মূল্যসীমা' : 'Illustrative current price range'}</strong>
                  <span>{landEstimate.currency || 'BDT'} {new Intl.NumberFormat(bangla ? 'bn-BD' : 'en-BD').format(landEstimate.estimated_total_min)} – {new Intl.NumberFormat(bangla ? 'bn-BD' : 'en-BD').format(landEstimate.estimated_total_max)}</span>
                  <small>{landEstimate.disclaimer}</small>
                </div>
                <PriceProjectionChart estimate={landEstimate} bangla={bangla} />
              </div> : <p>{bangla ? 'মূল্য ও গ্রাফ লোড হচ্ছে…' : 'Loading price outlook and chart…'}</p>}
              <div className="reports-land-actions">
                <button type="button" className="primary-button" onClick={printLandReportAsPdf} disabled={!passport || landEstimateId !== selectedLand.land_id}>{bangla ? 'PDF হিসেবে সংরক্ষণ / প্রিন্ট' : 'Save report as PDF / Print'}</button>
                <button type="button" className="primary-button" onClick={verifyPassport} disabled={!passport}>{bangla ? 'ডেমো পাসপোর্ট যাচাই' : 'Verify demo passport'}</button>
              </div>
              {verificationResult && <p className="result-message">{verificationResult}</p>}
              <div className="demo-notice">{text.demo}</div>
            </section>}
            </div>
            <aside className="dashboard-assistant-card reports-assistant-card">
              <div className="assistant-card-heading"><span className="assistant-orbit" aria-hidden="true">✳</span><span>{bangla ? 'সহায়তা প্রয়োজন?' : 'NEED A HAND?'}</span></div>
              <AssistantPanel bangla={bangla} />
            </aside>
          </div>
        )}

        {page === 'inheritance' && (
          <div className="inheritance-page">
            <div className="inheritance-main">
              <InheritanceCalculator bangla={bangla} />
            </div>
            <aside className="dashboard-assistant-card inheritance-assistant-card">
              <div className="assistant-card-heading"><span className="assistant-orbit" aria-hidden="true">✳</span><span>{bangla ? 'সহায়তা প্রয়োজন?' : 'NEED A HAND?'}</span></div>
              <AssistantPanel bangla={bangla} />
            </aside>
          </div>
        )}
        {page === 'about' && (
          <div className="about-page">
            <div className="about-main">
            <section className="page-intro">
              <div className="eyebrow">BHUMILIPI</div>
              <h1>{bangla ? 'ভূমিলিপি সম্পর্কে' : 'About BhumiLipi'}</h1>
              <p>
                {bangla
                  ? 'জমি-সংক্রান্ত তথ্য ও সেবাকে আরও সহজে বুঝতে সাহায্য করার একটি প্রোটোটাইপ।'
                  : 'A prototype designed to make land related information and services easier to understand.'}
              </p>
            </section>
            <section className="tool-panel about-panel">
              <h2>{bangla ? 'আমাদের উদ্দেশ্য' : 'Our purpose'}</h2>
              <p>
                {bangla
                  ? 'BhumiLipi-তে জমির রেকর্ড খোঁজা, প্রাথমিক ঝুঁকির সংকেত দেখা, ভূমিসেবা সম্পর্কে জানা এবং সাধারণ নির্দেশিকা পাওয়ার সুবিধা এক জায়গায় আনার চেষ্টা করা হয়েছে।'
                  : 'BhumiLipi brings together land record search, preliminary risk signals, information about land services, and practical guides in one place.'}
              </p>
              <h2>{bangla ? 'যা জানতে হবে' : 'What to know'}</h2>
              <p>
                {bangla
                  ? 'এই সংস্করণটি একটি demo prototype। এখানে দেখানো জমি ও ঝুঁকির তথ্য synthetic demo data; এগুলো সরকারি রেকর্ড, মালিকানার প্রমাণ, আইনি পরামর্শ বা জালিয়াতি শনাক্তের চূড়ান্ত সিদ্ধান্ত নয়।'
                  : 'This version is a demo prototype. Land and risk information shown here is synthetic demo data. It is not an official record, proof of ownership, legal advice, or a final fraud determination.'}
              </p>
              <p>
                {bangla
                  ? 'জমি কেনা, নির্মাণ বা আইনি পদক্ষেপের আগে সংশ্লিষ্ট সরকারি ভূমি অফিসে মূল দলিল ও হালনাগাদ রেকর্ড যাচাই করুন এবং প্রয়োজন হলে যোগ্য আইনজীবীর পরামর্শ নিন।'
                  : 'Before buying land, building, or taking legal action, verify original deeds and current records with the relevant government land office and consult a qualified lawyer when needed.'}
              </p>
            </section>
            </div>
            <aside className="dashboard-assistant-card about-assistant-card">
              <div className="assistant-card-heading"><span className="assistant-orbit" aria-hidden="true">✳</span><span>{bangla ? 'সহায়তা প্রয়োজন?' : 'NEED A HAND?'}</span></div>
              <AssistantPanel bangla={bangla} />
            </aside>
          </div>
        )}


        {page === 'laws' && (
          <div className="laws-page">
            <div className="laws-main">
            <section className="page-intro">
              <div className="eyebrow">BHUMILIPI · GUIDE</div>
              <h1>{text.lawsTitle}</h1>
              <p>{text.lawsHint}</p>
            </section>
            <section className="tool-panel">
              <h2>{bangla ? 'জমি যাচাইয়ের সাধারণ ধাপ' : 'General land-check steps'}</h2>
              <ol className="guide-list">
                <li>{bangla ? 'খতিয়ান, দাগ ও মৌজার তথ্য মিলিয়ে দেখুন।' : 'Compare the khatian, dag, and mouza details.'}</li>
                <li>{bangla ? 'দলিল ও নামজারির তথ্য সংশ্লিষ্ট অফিসে যাচাই করুন।' : 'Confirm deed and mutation information with the relevant office.'}</li>
                <li>{bangla ? 'মালিকানা ইতিহাস ও কোনো বিরোধ আছে কি না খোঁজ নিন।' : 'Review ownership history and ask about any disputes.'}</li>
                <li>{bangla ? 'প্রয়োজনে আইনজীবী বা ভূমি অফিসের সাহায্য নিন।' : 'Consult a qualified lawyer or land office when needed.'}</li>
              </ol>
            </section>
            <section className="tool-panel registration-guide">
              <h2>{bangla ? 'জমি কেনার দলিল রেজিস্ট্রেশন: ধাপে ধাপে' : 'Buying land: step-by-step deed registration'}</h2>
              <p>{bangla
                ? 'নিচের নির্দেশনা সাধারণ বিক্রয়/সাফ-কবলা দলিলের জন্য। দান, হেবা, উত্তরাধিকার বা বণ্টনের দলিলের নিয়ম আলাদা হতে পারে।'
                : 'This overview is for a usual sale/conveyance deed. Gift, heba, inheritance, and partition deeds can follow different requirements.'}</p>
              <ol className="guide-list">
                <li>{bangla ? 'জমির সঠিক পরিচয় নিন: জেলা, উপজেলা, মৌজা, খতিয়ান, দাগ, জমির পরিমাণ ও সীমানা। e-পর্চা/ভূমি অফিসের রেকর্ডের সঙ্গে বিক্রেতার কাগজ মিলিয়ে দেখুন।' : 'Identify the land precisely: district, upazila, mouza, khatian, dag, area, and boundaries. Compare the seller’s papers with e-Porcha and land-office records.'}</li>
                <li>{bangla ? 'বিক্রেতার মালিকানার ধারাবাহিকতা যাচাই করুন। উত্তরাধিকারসূত্রে মালিক হলে ওয়ারিশ ও বিক্রেতার অংশ যাচাই করুন; একজন সহ-মালিক যেন নিজের অংশের বেশি বিক্রি না করেন।' : 'Verify the seller’s title chain. For inherited land, confirm the heirs and seller’s share; a co-owner should not sell more than their own share.'}</li>
                <li>{bangla ? 'Registration Act-এর ৫২A ধারা অনুযায়ী বিক্রয় দলিলে সর্বশেষ খতিয়ান, জমির প্রকৃতি ও মূল্য, অক্ষ-সীমানাসহ নকশা, গত ২৫ বছরের মালিকানার সংক্ষিপ্ত বিবরণ এবং বিক্রেতার বৈধ মালিকানা/আগে হস্তান্তর না করার হলফনামা প্রয়োজন।' : 'Registration Act section 52A requires the sale deed to include the latest khatian, land type and price, a map with boundaries, a brief 25-year ownership history, and the seller’s affidavit of lawful title and no prior transfer.'}</li>
                <li>{bangla ? 'জমির দখল ও সীমানা সরেজমিনে দেখুন। বন্ধক, মামলা, অধিগ্রহণ বা অন্য কোনো বাধা আছে কি না সংশ্লিষ্ট অফিসে যাচাই করুন; দরকার হলে স্বাধীন সার্ভেয়ার/আইনজীবীর সহায়তা নিন।' : 'Inspect possession and boundaries in person. Check for mortgages, court disputes, acquisition, or other restrictions with the relevant offices; use an independent surveyor or lawyer if needed.'}</li>
                <li>{bangla ? 'দলিল প্রস্তুত হলে পুরো দলিল পড়ে নাম, NID, জমির বিবরণ, মূল্য, সীমানা ও টাকা দেওয়ার শর্ত মিলিয়ে নিন। কোনো ফাঁকা কাগজে সই বা টিপসই দেবেন না।' : 'Before signing, read the entire deed and verify names, NIDs, land description, price, boundaries, and payment terms. Never sign or fingerprint a blank paper.'}</li>
                <li>{bangla ? 'জমির পুরোটা বা প্রধান অংশ যে এলাকার মধ্যে, সেই এলাকার Sub-Registrar অফিসে দলিল জমা দিন। সাধারণ দলিল সম্পাদনের ৩ মাসের মধ্যে উপস্থাপন করতে হয়; বিক্রয়-চুক্তির আলাদা ৬০ দিনের সময়সীমা আছে।' : 'Present the deed at the Sub-Registrar office for the area where all or the major part of the land lies. A usual deed must be presented within 3 months of execution; a contract for sale has a separate 60-day limit.'}</li>
                <li>{bangla ? 'সরকারি ফি/কর অফিসের প্রকাশিত তালিকা অনুযায়ী পরিশোধ করুন। প্রতিটি পরিশোধের চালান/সরকারি রসিদ নিন; দলিল লেখক বা আইনজীবীর ব্যক্তিগত পারিশ্রমিক সরকারি ফি নয়—আলাদা লিখিত হিসাব ও রসিদ নিন।' : 'Pay government fees and taxes against the published official schedule. Keep each challan/official receipt; a deed writer’s or lawyer’s private charge is not a government fee, so get a separate written quote and receipt.'}</li>
                <li>{bangla ? 'নিবন্ধনের পর রসিদ ও রেজিস্ট্রি করা দলিলের কপি সংগ্রহ করুন। এরপর নতুন মালিকের নামে নামজারির আবেদন mutation.land.gov.bd-তে করুন এবং আবেদন/পেমেন্ট ট্র্যাক করুন।' : 'After registration, collect the receipt and registered deed copy. Then apply for mutation in the new owner’s name at mutation.land.gov.bd and keep the application/payment records.'}</li>
              </ol>

              <h3>{bangla ? 'আগে থেকে যে কাগজগুলো প্রস্তুত রাখবেন' : 'Documents to prepare'}</h3>
              <ul className="guide-list">
                <li>{bangla ? 'বিক্রেতার সর্বশেষ খতিয়ান; উত্তরাধিকার হলে পূর্বসূরির খতিয়ান ও ওয়ারিশ/অংশের কাগজ।' : 'Seller’s latest khatian; for inherited land, predecessor’s khatian and inheritance/share documents.'}</li>
                <li>{bangla ? 'আগের মালিকানার রেজিস্ট্রি দলিল/দলিলের ধারাবাহিকতা, মৌজা ম্যাপ বা সীমানার নকশা, দাগ-খতিয়ানের তথ্য।' : 'Earlier registered deeds/title chain, mouza map or boundary plan, and dag/khatian details.'}</li>
                <li>{bangla ? 'ক্রেতা-বিক্রেতার NID ও ঠিকানার তথ্য; প্রতিনিধি থাকলে বৈধ Power of Attorney। প্রযোজ্য ক্ষেত্রে TIN/রিটার্নের কাগজও চাইতে পারে।' : 'Buyer’s and seller’s NID/address details; valid power of attorney if represented. TIN/return documents may be required in applicable cases.'}</li>
                <li>{bangla ? 'হালনাগাদ ভূমি উন্নয়ন কর/দাখিলার রসিদ, দলিলের খসড়া এবং সরকারি ফি পরিশোধের প্রমাণ। অফিসভেদে অতিরিক্ত কাগজ চাইতে পারে।' : 'Current land-development-tax/dakhila receipt, deed draft, and proof of official fee payments. The office may require additional documents for the case.'}</li>
              </ul>

              <h3>{bangla ? 'সরকারি খরচ: কীভাবে যাচাই করবেন' : 'Government costs: how to verify the amount'}</h3>
              <p>{bangla
                ? 'একটি নির্দিষ্ট মোট অঙ্ক সবার জন্য প্রযোজ্য নয়। দলিলের ধরন, সরকারি মূল্যায়ন/দলিলমূল্য, জমির অবস্থান এবং প্রযোজ্য কর অনুযায়ী রেজিস্ট্রেশন ফি, স্ট্যাম্প শুল্ক, স্থানীয় সরকার কর, উৎসে কর এবং প্রযোজ্য VAT বদলাতে পারে। Stamp Act-এর বর্তমান Schedule I-তে সাধারণ conveyance-এর stamp duty ১.৫% (সর্বোচ্চ ২ কোটি টাকা) বলা আছে; অন্য ফি/কর এর বাইরে এবং ক্ষেত্রে ভিন্ন হতে পারে।'
                : 'There is no single total for every transaction. Registration fee, stamp duty, local-government tax, tax collected at source, and VAT where applicable can depend on deed type, assessed/deed value, location, and applicable tax rules. The current Stamp Act Schedule I lists stamp duty for a usual conveyance as 1.5% (maximum Tk 2 crore); other fees/taxes are additional and can vary.'}</p>
              <p>{bangla
                ? 'নিবন্ধন অধিদপ্তরের প্রকাশিত ফি-তালিকা দেখে সংশ্লিষ্ট Sub-Registrar অফিস থেকে আপনার জমির জন্য লিখিত itemized হিসাব নিন। ১৬ সেপ্টেম্বর ২০২৫ তারিখে প্রকাশিত তালিকার পর নতুন প্রজ্ঞাপন আছে কি না-ও জেনে নিন।'
                : 'Use the Registration Directorate’s published schedule and request an itemized written calculation from the relevant Sub-Registrar office. Ask whether any later notice has updated the schedule published on 16 September 2025.'}</p>
              <p>{bangla
                ? 'নামজারি আলাদা ধাপ। ভূমি মন্ত্রণালয়ের ফি পাতায় বর্তমানে আবেদন কোর্ট ফি ২০ টাকা, নোটিশ ফি ৫০ টাকা এবং DCR ফি ১,১০০ টাকা (মোট ১,১৭০ টাকা) দেখানো আছে; আবেদনের আগে পাতায় হালনাগাদ অঙ্ক মিলিয়ে নিন।'
                : 'Mutation is a separate step. The Ministry of Land fee page currently lists Tk 20 application court fee, Tk 50 notice fee, and Tk 1,100 DCR fee (Tk 1,170 total); recheck the page before applying in case it changes.'}</p>

              <h3>{bangla ? 'অতিরিক্ত টাকা চাওয়া হলে' : 'If someone asks for extra money'}</h3>
              <ul className="guide-list">
                <li>{bangla ? 'সরকারি ফি ও ব্যক্তিগত service charge আলাদা করে লিখিত হিসাব চান।' : 'Ask for government fees and private service charges to be itemized separately in writing.'}</li>
                <li>{bangla ? 'সরকারি চালান/রসিদ ছাড়া কাউকে “অফিস খরচ” বা দ্রুত করানোর টাকা দেবেন না।' : 'Do not pay undocumented “office” or expediting money; ask for an official challan/receipt.'}</li>
                <li>{bangla ? 'সমস্যা বা অনিয়ম হলে সরকারি GRS-এ অভিযোগ জানান। ভূমিসেবা সহায়তার জন্য ১৬১২২-এ কল করুন; নির্দিষ্ট দলিল-ফির জন্য সংশ্লিষ্ট Sub-Registrar অফিসের প্রকাশিত তালিকা যাচাই করুন।' : 'For service problems or irregularities, file a complaint through the government GRS. Call 16122 for land-service support; verify deed-specific charges with the relevant Sub-Registrar office.'}</li>
              </ul>

              <h3>{bangla ? 'সরকারি সূত্র ও যোগাযোগ' : 'Official references and contacts'}</h3>
              <ul className="guide-list">
                <li><a href="https://rd.gov.bd/pages/static-pages/6922dc81933eb65569e10b8b" target="_blank" rel="noreferrer">{bangla ? 'নিবন্ধন অধিদপ্তর: দলিল ফি, স্ট্যাম্প শুল্ক ও করের তালিকা' : 'Registration Directorate: deed fees, stamp duties, and taxes'}</a></li>
                <li><a href="https://rd.gov.bd/pages/static-pages/6922dc3c933eb65569e0f2cc" target="_blank" rel="noreferrer">{bangla ? 'নিবন্ধন অধিদপ্তর: অফিসের তালিকা' : 'Registration Directorate: office directory'}</a></li>
                <li><a href="https://bdlaws.minlaw.gov.bd/act-print-90/section-print-22972.html" target="_blank" rel="noreferrer">{bangla ? 'Registration Act, 1908 — ধারা ৫২A: বিক্রয় দলিলে প্রয়োজনীয় তথ্য' : 'Registration Act, 1908 — section 52A: particulars required in a sale deed'}</a></li>
                <li><a href="https://bdlaws.minlaw.gov.bd/act-90/act-part-print-102.html" target="_blank" rel="noreferrer">{bangla ? 'Registration Act — দলিল উপস্থাপনের সময়সীমা (ধারা ২৩)' : 'Registration Act — time limit for presenting documents (section 23)'}</a></li>
                <li><a href="https://bdlaws.minlaw.gov.bd/act-print-90/section-print-22918.html" target="_blank" rel="noreferrer">{bangla ? 'Registration Act — বিক্রয়-চুক্তি লিখিত ও নিবন্ধনের নিয়ম (ধারা ১৭A)' : 'Registration Act — written and registered contract-for-sale rule (section 17A)'}</a></li>
                <li><a href="https://bdlaws.minlaw.gov.bd/act-90/act-part-print-103.html" target="_blank" rel="noreferrer">{bangla ? 'Registration Act — জমির জন্য কোন Sub-Registrar অফিস (ধারা ২৮)' : 'Registration Act — Sub-Registrar jurisdiction for land (section 28)'}</a></li>
                <li><a href="https://bdlaws.minlaw.gov.bd/act-90/act-part-print-293.html" target="_blank" rel="noreferrer">{bangla ? 'Registration Act — সরকারি ফি ও রসিদ (ধারা ৭৮–৮০)' : 'Registration Act — official fees and receipts (sections 78–80)'}</a></li>
                <li><a href="https://bdlaws.minlaw.gov.bd/act-print-1409.html" target="_blank" rel="noreferrer">{bangla ? 'Stamp Act, 1899 — Schedule I, conveyance stamp duty' : 'Stamp Act, 1899 — Schedule I, conveyance stamp duty'}</a></li>
                <li><a href="https://nbr.gov.bd/uploads/acts/Finance_Act_2026.pdf" target="_blank" rel="noreferrer">{bangla ? 'জাতীয় রাজস্ব বোর্ড: অর্থ আইন ২০২৬' : 'National Board of Revenue: Finance Act 2026'}</a></li>
                <li><a href="https://land.gov.bd/vumisheba-fee?lang=bn" target="_blank" rel="noreferrer">{bangla ? 'ভূমি মন্ত্রণালয়: নির্ধারিত ভূমিসেবা ফি' : 'Ministry of Land: prescribed land-service fees'}</a></li>
                <li><a href="https://mutation.land.gov.bd/nirdeshika" target="_blank" rel="noreferrer">{bangla ? 'ই-নামজারি নির্দেশিকা' : 'e-Mutation instructions'}</a></li>
                <li><a href="https://www.land.gov.bd/" target="_blank" rel="noreferrer">{bangla ? 'ভূমি পোর্টাল · হটলাইন ১৬১২২' : 'Land portal · hotline 16122'}</a> · <a href="tel:16122">{bangla ? 'কল করুন' : 'Call'}</a></li>
                <li><a href="https://grs.gov.bd/" target="_blank" rel="noreferrer">{bangla ? 'সরকারি অভিযোগ প্রতিকার ব্যবস্থা (GRS)' : 'Government Grievance Redress System (GRS)'}</a></li>
              </ul>
              <p className="demo-notice">{bangla
                ? 'এটি সাধারণ সচেতনতামূলক নির্দেশনা, আইনি পরামর্শ নয়। টাকা দেওয়ার আগে সংশ্লিষ্ট Sub-Registrar অফিস ও সরকারি ফি-তালিকায় বর্তমান নিয়ম নিশ্চিত করুন; জটিল মালিকানা/বিরোধে স্বাধীন আইনজীবীর পরামর্শ নিন।'
                : 'This is general awareness guidance, not legal advice. Confirm current requirements and charges with the relevant Sub-Registrar office and official schedule before paying; seek independent legal advice for disputed or complex title.'}</p>
            </section>
            <section className="tool-panel">
  <h2>{bangla ? 'সরকারি ভূমিসেবা' : 'Official land services'}</h2>

  <ul className="guide-list">
    <li>
      <a
        href="https://land.gov.bd/nagorik-subidha"
        target="_blank"
        rel="noreferrer"
      >
        {bangla ? 'ভূমি পোর্টাল: নাগরিক সেবা' : 'Land portal: Citizen services'}
      </a>
    </li>

    <li>
      <a
        href="https://mutation.land.gov.bd/nirdeshika"
        target="_blank"
        rel="noreferrer"
      >
        {bangla ? 'ই-নামজারি নির্দেশিকা' : 'e-Mutation instructions'}
      </a>
    </li>
    <li>
  <a href="https://ldtax.gov.bd/" target="_blank" rel="noreferrer">
    {bangla ? 'ভূমি উন্নয়ন কর পোর্টাল' : 'Land Development Tax portal'}
  </a>
</li>
<li>
  <a href="https://eporcha.gov.bd/" target="_blank" rel="noreferrer">
    {bangla ? 'ই-পর্চা: খতিয়ান ও মৌজা ম্যাপ' : 'e-Porcha: Khatian and Mouza maps'}
  </a>
</li>
  </ul>
</section>
            </div>
            <aside className="dashboard-assistant-card laws-assistant-card">
              <div className="assistant-card-heading"><span className="assistant-orbit" aria-hidden="true">✳</span><span>{bangla ? 'সহায়তা প্রয়োজন?' : 'NEED A HAND?'}</span></div>
              <AssistantPanel bangla={bangla} />
            </aside>
          </div>
        )}
        {page === 'faq' && (
          <div className="faq-page">
            <div className="faq-main">
            <section className="page-intro">
              <div className="eyebrow">BHUMILIPI · HELP</div>
              <h1>{text.faq}</h1>
              <p>{bangla ? 'জমির রেকর্ড ও ভূমিসেবা সম্পর্কে সাধারণ প্রশ্নের উত্তর।' : 'Quick answers to common questions about land records and services.'}</p>
            </section>
            <section className="tool-panel">
              <label htmlFor="faq-search">{bangla ? 'কী সাহায্য দরকার?' : 'What do you need help with?'}</label>
              <input
                id="faq-search"
                className="faq-search"
                type="search"
                value={faqQuery}
                onChange={(event) => setFaqQuery(event.target.value)}
                placeholder={bangla ? 'যেমন: খতিয়ান, রেজিস্ট্রেশন, satellite, উত্তরাধিকার…' : 'Try: khatian, registration, satellite, inheritance…'}
                aria-describedby="faq-search-hint"
              />
              <p id="faq-search-hint" className="demo-notice">
                {bangla ? 'প্রশ্ন, উত্তর এবং বাংলা/ইংরেজি keyword দিয়ে খুঁজুন।' : 'Search questions, answers, and keywords in Bangla or English.'}
              </p>
              {faqEntries
                .filter((entry) => {
                  const normalizedQuery = faqQuery.trim().toLocaleLowerCase()
                  if (!normalizedQuery) return true
                  const searchableText = [entry.questionBn, entry.answerBn, entry.questionEn, entry.answerEn, entry.keywords]
                    .join(' ')
                    .toLocaleLowerCase()
                  return normalizedQuery.split(/\s+/).every((word) => searchableText.includes(word))
                })
                .map((entry) => (
                  <details key={entry.questionEn}>
                    <summary>{bangla ? entry.questionBn : entry.questionEn}</summary>
                    <p>{bangla ? entry.answerBn : entry.answerEn}</p>
                  </details>
                ))}
              {faqEntries.filter((entry) => {
                const normalizedQuery = faqQuery.trim().toLocaleLowerCase()
                if (!normalizedQuery) return true
                const searchableText = [entry.questionBn, entry.answerBn, entry.questionEn, entry.answerEn, entry.keywords]
                  .join(' ')
                  .toLocaleLowerCase()
                return normalizedQuery.split(/\s+/).every((word) => searchableText.includes(word))
              }).length === 0 && (
                <p className="result-message">
                  {bangla ? 'এই keyword-এ কোনো FAQ মেলেনি। অন্য শব্দ দিয়ে খুঁজুন অথবা Land Laws & Guides দেখুন।' : 'No FAQ matched those keywords. Try different words or open Land Laws & Guides.'}
                </p>
              )}
            </section>
            </div>
            <aside className="dashboard-assistant-card faq-assistant-card">
              <div className="assistant-card-heading"><span className="assistant-orbit" aria-hidden="true">✳</span><span>{bangla ? 'সহায়তা প্রয়োজন?' : 'NEED A HAND?'}</span></div>
              <AssistantPanel bangla={bangla} />
            </aside>
          </div>
        )}
        {page === 'buildability' && (
  <div className="buildability-page">
    <div className="buildability-main">
      <section className="page-intro buildability-intro">
        <div className="eyebrow">BHUMILIPI · DEMO</div>
        <h1>{bangla ? 'নির্মাণ উপযোগিতা' : 'Build Suitability'}</h1>
        <p>{bangla ? 'নির্বাচিত জমির মাটির পরীক্ষার তথ্য দেখুন।' : 'Review soil-test information for the selected land.'}</p>
      </section>
  <section className="tool-panel build-suitability-panel">
    <h2>{bangla ? 'বাড়ি নির্মাণের প্রাথমিক বিশ্লেষণ' : 'Preliminary Build Suitability'}</h2>
    <p>
      {bangla
        ? 'Soil test report-এর তথ্য দিন। এটি নির্মাণের নিরাপত্তার চূড়ান্ত সিদ্ধান্ত নয়।'
        : 'Enter details from the soil test report. This is not a final construction safety decision.'}
    </p>
      
    <select
  className="build-input"
  value={buildLandId}
  onChange={(event) => {
    setBuildLandId(event.target.value)
    setBuildAssessment('')
  }}
>
  {lands.map((land) => (
    <option key={land.land_id} value={land.land_id}>
      {land.land_id}
    </option>
  ))}
</select>

    <button className="primary-button build-button" onClick={handleBuildAssessment}>
      {bangla ? 'তথ্য বিশ্লেষণ করুন' : 'Review details'}
    </button>

    {buildAssessment && <div className="build-result-card" role="status" aria-live="polite"><strong>{buildLandId}</strong><p>{buildAssessment}</p></div>}
  </section>
    </div>
    <aside className="dashboard-assistant-card buildability-assistant-card">
      <div className="assistant-card-heading"><span className="assistant-orbit" aria-hidden="true">✳</span><span>{bangla ? 'সহায়তা প্রয়োজন?' : 'NEED A HAND?'}</span></div>
      <AssistantPanel bangla={bangla} />
    </aside>
  </div>
)}
{page !== 'dashboard' && page !== 'search' && page !== 'reports' && page !== 'inheritance' && page !== 'buildability' && page !== 'laws' && page !== 'faq' && page !== 'about' && page !== 'profile' && <AssistantPanel bangla={bangla} />}
      </main>

      {selectedLand && page !== 'buildability' && page !== 'search' && page !== 'reports' && (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelectedLand(null)}>
          <section className="modal" role="dialog" aria-modal="true" aria-label="Land record details" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h2>{selectedLand.land_id}</h2>
              <button onClick={() => setSelectedLand(null)}>{text.close}</button>
            </div>
            <p><strong>Mouza:</strong> {selectedLand.mouza} · <strong>Dag:</strong> {selectedLand.dag_number}</p>
            <p><strong>Khatian:</strong> {selectedLand.khatian_number} · <strong>Area:</strong> {selectedLand.area_decimal} decimal</p>
            <p><strong>Location:</strong> {selectedLand.upazila}, {selectedLand.district}</p>
            <p><strong>Owner reference:</strong> {selectedLand.owner_ref}</p>
            <p><strong>Risk score:</strong> {selectedLand.risk_score}/100 ({selectedLand.risk_level ?? 'Review'})</p>
            <p><strong>Risk factors:</strong> {selectedLand.risk_factors?.join(' · ') || 'No risk factor listed in this demo record.'}</p>
            {passport ? (
  <>
    <h3>Transfer history</h3>
    {passport.transfer_history.map((item) => (
      <p key={item.reference}>
        <strong>{item.date}</strong> · {item.event} ({item.reference})
      </p>
    ))}
    <p><strong>Integrity:</strong> {passport.integrity_status}</p>
    <p><strong>Last updated:</strong> {passport.last_updated}</p>
{landEstimate && landEstimateId === selectedLand.land_id && (
  <div className="result-message">
    <strong>Illustrative demo price range</strong>
    <p>
      ৳{new Intl.NumberFormat('en-BD').format(landEstimate.estimated_total_min)}
      {' – '}
      ৳{new Intl.NumberFormat('en-BD').format(landEstimate.estimated_total_max)}
    </p>
    <small>{landEstimate.disclaimer}</small>
    <PriceProjectionChart estimate={landEstimate} bangla={bangla} />
  </div>
)}
<button
  className="primary-button"
  onClick={downloadLandReport}
  style={{ marginRight: '12px' }}
>
  Download demo report
</button>
    <button className="primary-button" onClick={verifyPassport}>
  Verify demo passport
</button>
{verificationResult && (
  <p className="result-message">{verificationResult}</p>
)}
  </>
) : (
  <p>Loading passport details…</p>
)}
            <div className="demo-notice">{text.demo}</div>
          </section>
        </div>
      )}
      {accountDialogMode && <AccountPanel
        initialMode={accountDialogMode}
        bangla={bangla}
        onClose={() => setAccountDialogMode(null)}
        onAuthenticated={(result) => {
          if (authToken) {
            void fetch(`${API_BASE}/auth/logout`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${authToken}` },
            }).catch(() => {})
          }
          setAuthToken(result.access_token)
          setAuthUser(result.user)
          setContinueAsDemo(false)
          setPage('dashboard')
          setAccountDialogMode(null)
        }}
      />}
    </div>
  )
}

type LandListProps = {
  lands: Land[]
  query: string
  setQuery: (value: string) => void
  loading: boolean
  text: {
    records: string
    searchHint: string
    searchPlaceholder: string
    locationSearchHint: string
    locationSearchPlaceholder: string
    low: string
    medium: string
    highLabel: string
    details: string
    satellite: string
  }
  onSelect: (land: Land) => void
  onViewSatellite?: (land: Land) => void
  satelliteLand?: Land | null
  bangla?: boolean
  onCloseSatellite?: () => void
  inlineDetails?: boolean
}

function LandList({ lands, query, setQuery, loading, text, onSelect, onViewSatellite, satelliteLand, bangla = false, onCloseSatellite, inlineDetails = false }: LandListProps) {
  const [districtFilter, setDistrictFilter] = useState('')
  const [upazilaFilter, setUpazilaFilter] = useState('')
  const [mouzaFilter, setMouzaFilter] = useState('')
  const [optionalLandId, setOptionalLandId] = useState('')
  const [selectedLandId, setSelectedLandId] = useState('')
  const isLocationSearch = Boolean(onViewSatellite)
  const uniqueSorted = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const districtOptions = useMemo(() => uniqueSorted(lands.map((land) => land.district)), [lands])
  const upazilaOptions = useMemo(() => uniqueSorted(
    lands.filter((land) => !districtFilter || land.district === districtFilter).map((land) => land.upazila),
  ), [lands, districtFilter])
  const mouzaOptions = useMemo(() => uniqueSorted(
    lands.filter((land) => (!districtFilter || land.district === districtFilter)
      && (!upazilaFilter || land.upazila === upazilaFilter)).map((land) => land.mouza),
  ), [lands, districtFilter, upazilaFilter])
  const areaMatches = useMemo(() => lands.filter((land) =>
    (!districtFilter || land.district === districtFilter)
    && (!upazilaFilter || land.upazila === upazilaFilter)
    && (!mouzaFilter || land.mouza === mouzaFilter),
  ), [lands, districtFilter, upazilaFilter, mouzaFilter])
  const hasAreaSelection = Boolean(districtFilter || upazilaFilter || mouzaFilter)
  const hasSearchRequest = hasAreaSelection || Boolean(optionalLandId.trim())
  const landIdMatches = useMemo(() => {
    const term = optionalLandId.trim().toLocaleLowerCase()
    if (!term) return areaMatches
    return areaMatches.filter((land) => [land.land_id, land.mouza, String(land.dag_number), land.khatian_number]
      .some((value) => value.toLocaleLowerCase().includes(term)))
  }, [areaMatches, optionalLandId])
  const showingAreaFallback = Boolean(optionalLandId.trim()) && landIdMatches.length === 0 && hasAreaSelection
  const resultsToShow = showingAreaFallback ? areaMatches : landIdMatches
  const selectedLand = resultsToShow.find((land) => land.land_id === selectedLandId) ?? resultsToShow[0]

  return (
    <section className="records-panel">
      <div className="panel-heading">
        <div>
          <h2>{inlineDetails ? (bangla ? 'জমির রেকর্ড খুঁজুন' : 'Find a land record') : text.records}</h2>
          <p>{inlineDetails ? (bangla ? 'এখানে দেখানো সব রেকর্ড সিনথেটিক ডেমো ডেটা।' : 'All records shown here are synthetic demo data.') : isLocationSearch ? text.locationSearchHint : text.searchHint}</p>
        </div>
        {(!isLocationSearch || inlineDetails) && <input
          value={inlineDetails ? optionalLandId : query}
          onChange={(event) => inlineDetails ? setOptionalLandId(event.target.value) : setQuery(event.target.value)}
          placeholder={inlineDetails ? (bangla ? 'Land ID, মৌজা, দাগ বা খতিয়ান লিখুন…' : 'Enter Land ID or mouza…') : text.searchPlaceholder}
          aria-label={text.searchHint}
        />}
      </div>

      {isLocationSearch && <div className="land-search-controls">
        <label>
          {bangla ? '১. জেলা' : '1. District'}
          <select value={districtFilter} onChange={(event) => {
            setDistrictFilter(event.target.value)
            setUpazilaFilter('')
            setMouzaFilter('')
          }}>
            <option value="">{bangla ? 'জেলা বেছে নিন' : 'Choose district'}</option>
            {districtOptions.map((district) => <option key={district} value={district}>{district}</option>)}
          </select>
        </label>
        <label>
          {bangla ? '২. উপজেলা' : '2. Upazila'}
          <select value={upazilaFilter} onChange={(event) => {
            setUpazilaFilter(event.target.value)
            setMouzaFilter('')
          }}>
            <option value="">{bangla ? 'উপজেলা বেছে নিন' : 'Choose upazila'}</option>
            {upazilaOptions.map((upazila) => <option key={upazila} value={upazila}>{upazila}</option>)}
          </select>
        </label>
        <label>
          {bangla ? '৩. মৌজা' : '3. Mouza'}
          <select value={mouzaFilter} onChange={(event) => setMouzaFilter(event.target.value)}>
            <option value="">{bangla ? 'মৌজা বেছে নিন' : 'Choose mouza'}</option>
            {mouzaOptions.map((mouza) => <option key={mouza} value={mouza}>{mouza}</option>)}
          </select>
        </label>
        {!inlineDetails && <label className="optional-land-id">
          {bangla ? '৪. Land ID / মৌজা / দাগ / খতিয়ান' : '4. Search Land ID / mouza / dag / khatian'}
          <input
            value={optionalLandId}
            onChange={(event) => setOptionalLandId(event.target.value)}
            placeholder={bangla ? 'Land ID, mouza, দাগ বা খতিয়ান' : 'Land ID, mouza, dag, or khatian'}
            aria-label={text.searchHint}
          />
        </label>}
        <p className="search-guidance">
          {showingAreaFallback
            ? (inlineDetails ? (bangla ? 'এই তথ্যের সঙ্গে কোনো রেকর্ড মেলেনি। নির্বাচিত এলাকার রেকর্ড দেখানো হচ্ছে।' : 'No record matched that search. Showing records in the selected area.') : (bangla ? 'এই ID-তে মিল নেই। নির্বাচিত এলাকার জমিগুলো দেখানো হচ্ছে—সঠিক ID দিলে আরও নির্দিষ্ট ফল পাবেন।' : 'No record matched that ID. Showing available lands in the selected area; a correct ID can narrow the search.'))
            : (inlineDetails ? (bangla ? 'Land ID, মৌজা, দাগ বা খতিয়ান দিয়ে নির্দিষ্ট রেকর্ড খুঁজুন।' : 'Search for a record using its Land ID, mouza, dag, or khatian.') : (bangla ? 'Unique ID জানা থাকলে দিলে নির্দিষ্ট জমি খুঁজে পেতে সুবিধা হবে। না জানলেও নির্বাচিত এলাকার জমিগুলো দেখতে পারবেন।' : 'Providing the unique ID helps identify the exact land record. You can still browse records in the selected area without it.'))}
        </p>
      </div>}

      {loading ? (
        <p>Loading demo records…</p>
      ) : isLocationSearch && !inlineDetails && !hasSearchRequest ? (
        <p className="search-guidance">{bangla ? 'Land ID, মৌজা, দাগ বা খতিয়ান দিয়ে খুঁজুন; অথবা জেলা, উপজেলা ও মৌজা বেছে ফল দেখুন।' : 'Search by Land ID, mouza, dag, or khatian, or browse by choosing a district, upazila, and mouza.'}</p>
      ) : resultsToShow.length === 0 ? (
        <p>{inlineDetails ? (bangla ? 'এই তথ্য দিয়ে কোনো রেকর্ড মেলেনি। Land ID, মৌজা, দাগ বা খতিয়ান আবার মিলিয়ে দেখুন।' : 'No records matched. Check the Land ID, mouza, dag, or khatian and try again.') : (bangla ? 'এই তথ্য দিয়ে কোনো রেকর্ড মেলেনি। কাছাকাছি এলাকার ফল দেখতে ID মুছে দিন বা স্থান নির্বাচন করুন।' : 'No records matched. Clear the ID or choose a location to browse records from that area.')}</p>
      ) : (
        <div className={inlineDetails ? 'land-search-results-layout' : undefined}>
        <div className="land-list">
          {inlineDetails ? <div className="land-search-table-wrap">
            <table className="land-search-table">
              <thead><tr>
                <th>{bangla ? 'Land ID' : 'Land ID'}</th>
                <th>{bangla ? 'মৌজা' : 'Mouza'}</th>
                <th>{bangla ? 'জমির পরিমাণ' : 'Area'}</th>
                <th>{bangla ? 'ঝুঁকির সংকেত' : 'Risk signal'}</th>
              </tr></thead>
              <tbody>{resultsToShow.map((land) => {
                const level = land.risk_score >= 60 ? 'high' : land.risk_score >= 35 ? 'medium' : 'low'
                const badgeText = level === 'high' ? text.highLabel : level === 'medium' ? text.medium : text.low
                const isSelected = selectedLand?.land_id === land.land_id
                return <tr
                  key={land.land_id}
                  className={isSelected ? 'is-selected is-clickable' : 'is-clickable'}
                  aria-selected={isSelected}
                  tabIndex={0}
                  onClick={() => { setSelectedLandId(land.land_id); onSelect(land) }}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedLandId(land.land_id)
                      onSelect(land)
                    }
                  }}
                >
                  <td><button type="button" className="land-search-row-select" onClick={() => setSelectedLandId(land.land_id)} aria-pressed={isSelected}>{land.land_id}</button></td>
                  <td>{land.mouza}</td>
                  <td>{land.area_decimal} decimal</td>
                  <td><span className={`risk-badge risk-${level}`}>{land.risk_score} · {badgeText}</span></td>
                </tr>
              })}</tbody>
            </table>
          </div> : resultsToShow.map((land) => {
            const level = land.risk_score >= 60 ? 'high' : land.risk_score >= 35 ? 'medium' : 'low'
            const badgeText = level === 'high' ? text.highLabel : level === 'medium' ? text.medium : text.low

            return (
              <div className="land-result-group" key={land.land_id}>
                <article className="land-card">
                  <div>
                    <h3>{land.land_id} · {land.mouza}</h3>
                    <p>Dag {land.dag_number} · {land.area_decimal} decimal · Khatian {land.khatian_number}</p>
                    <p>{land.upazila}, {land.district} · Owner ref {land.owner_ref}</p>
                    <p>{land.risk_factors?.join(' · ') || 'No risk factor listed in this demo record.'}</p>
                  </div>
                  <div className="land-card-actions">
                    <div className={`risk-badge risk-${level}`}><span>{bangla ? 'ঝুঁকি' : 'Risk'}: </span>{land.risk_score}/100 · {badgeText}</div>
                    {inlineDetails && <button type="button" className="select-land-button" aria-pressed={selectedLand?.land_id === land.land_id} onClick={() => setSelectedLandId(land.land_id)}>{selectedLand?.land_id === land.land_id ? (bangla ? 'নির্বাচিত' : 'Selected') : (bangla ? 'রেকর্ড বাছুন' : 'Select record')}</button>}
                    <button onClick={() => onSelect(land)}>{text.details}</button>
                    {onViewSatellite && <button type="button" onClick={() => onViewSatellite(land)}>◉ &nbsp; {text.satellite}</button>}
                  </div>
                </article>
                {satelliteLand?.land_id === land.land_id && onCloseSatellite && (
                  <SatelliteView land={satelliteLand} bangla={bangla} onClose={onCloseSatellite} />
                )}
              </div>
            )
          })}
        </div>
        {inlineDetails && selectedLand && <aside className="land-search-detail" aria-live="polite">
          <div className="eyebrow">{bangla ? 'নির্বাচিত রেকর্ড' : 'SELECTED RECORD'}</div>
          <h2>{selectedLand.land_id} · {selectedLand.mouza}</h2>
          <p>{selectedLand.district} · {selectedLand.area_decimal} decimal</p>
          <div className="land-search-demo-callout">{bangla ? 'সিনথেটিক ডেমো রেকর্ড। সব তথ্য সরকারি রেকর্ডের সঙ্গে মিলিয়ে নিন।' : 'Synthetic demo record. Confirm all details with official records.'}</div>
          <div className={`risk-badge risk-${selectedLand.risk_score >= 60 ? 'high' : selectedLand.risk_score >= 35 ? 'medium' : 'low'}`}>
            {bangla ? 'ঝুঁকির সংকেত' : 'Risk signal'}: {selectedLand.risk_score} · {selectedLand.risk_score >= 60 ? text.highLabel : selectedLand.risk_score >= 35 ? text.medium : text.low}
          </div>
          <div className="land-search-detail-actions">
            <button type="button" onClick={() => onSelect(selectedLand)}>{bangla ? 'জমির বিস্তারিত খুলুন →' : 'Open land details →'}</button>
            {onViewSatellite && <button type="button" onClick={() => onViewSatellite(selectedLand)}>◉ &nbsp; {text.satellite}</button>}
          </div>
        </aside>}
        {inlineDetails && satelliteLand && satelliteLand.land_id === selectedLand.land_id && onCloseSatellite && (
          <div className="land-search-satellite-slot">
            <SatelliteView land={satelliteLand} bangla={bangla} onClose={onCloseSatellite} />
          </div>
        )}
        </div>
      )}
    </section>
  )
}

export default App
