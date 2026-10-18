import { useState } from 'react'

type Message = {
  role: 'user' | 'assistant'
  text: string
}
const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

const errorMessages = {
  en: {
    keyMissing: 'The Gemini API key is missing from the backend. Add it to backend/.env, then restart the backend.',
    geminiFailed: 'Gemini could not answer this request. Check the backend key, model access, and internet connection, then try again.',
    keyRejected: 'Google rejected this API key or its access. In Google AI Studio → API Keys, create a new Authorization key (Standard keys stopped working in September 2026), ensure it is enabled for the Gemini API, replace the value in backend/.env, and restart the backend.',
    modelUnavailable: 'The configured Gemini model is unavailable for this key. Check GEMINI_MODEL in backend/.env.',
    quotaExceeded: 'The Gemini API quota or billing limit was reached. Check project usage and quota in Google AI Studio.',
    geminiNetwork: 'The backend could not connect to Google Gemini. Check internet access, proxy, or firewall settings, then try again.',
    geminiService: 'Google Gemini is temporarily unavailable. Wait a little and try again.',
    network: 'Could not reach the backend. Check that the BhumiLipi API is available, then try again.',
    notFound: 'That demo land record was not found. Choose one of the listed sample land IDs.',
    generic: 'The assistant could not complete this request. Please try again.',
  },
  bn: {
    keyMissing: 'Backend-এ Gemini API key পাওয়া যায়নি। backend/.env ফাইলে key যোগ করে backend আবার চালু করুন।',
    geminiFailed: 'Gemini এই প্রশ্নের উত্তর দিতে পারেনি। Backend key, model access এবং internet connection দেখে আবার চেষ্টা করুন।',
    keyRejected: 'Google এই API key বা এর access প্রত্যাখ্যান করেছে। Google AI Studio → API Keys থেকে নতুন Authorization key তৈরি করুন (Standard key সেপ্টেম্বর ২০২৬ থেকে কাজ করে না), Gemini API access নিশ্চিত করে backend/.env-এ key বদলান এবং backend আবার চালু করুন।',
    modelUnavailable: 'এই key-এর জন্য নির্ধারিত Gemini model পাওয়া যাচ্ছে না। backend/.env-এর GEMINI_MODEL যাচাই করুন।',
    quotaExceeded: 'Gemini API quota বা billing limit পূর্ণ হয়েছে। Google AI Studio-তে project usage ও quota দেখুন।',
    geminiNetwork: 'Backend Google Gemini-তে সংযোগ করতে পারেনি। Internet, proxy বা firewall settings দেখে আবার চেষ্টা করুন।',
    geminiService: 'Google Gemini সাময়িকভাবে পাওয়া যাচ্ছে না। কিছুক্ষণ পর আবার চেষ্টা করুন।',
    network: 'Backend-এর সঙ্গে সংযোগ হয়নি। BhumiLipi API চালু আছে কি না দেখে আবার চেষ্টা করুন।',
    notFound: 'এই demo land record পাওয়া যায়নি। তালিকার sample land ID-গুলোর একটি বেছে নিন।',
    generic: 'Assistant অনুরোধটি সম্পন্ন করতে পারেনি। অনুগ্রহ করে আবার চেষ্টা করুন।',
  },
}

function AssistantPanel({ bangla }: { bangla: boolean }) {
  const [landId, setLandId] = useState('BL-001')
  const [projectType, setProjectType] = useState('house')
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])

  const sendQuestion = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const message = question.trim()
    if (!message || loading) return

    setMessages((current) => [...current, { role: 'user', text: message }])
    setQuestion('')
    setLoading(true)

    try {
      const response = await fetch(`${API_BASE}/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          land_id: landId,
          project_type: projectType,
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.detail || `http_${response.status}`)
      }

      if (typeof data.answer !== 'string' || !data.answer.trim()) {
        throw new Error('invalid_assistant_response')
      }

      setMessages((current) => [
        ...current,
        { role: 'assistant', text: data.answer },
      ])
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : ''
      const copy = errorMessages[bangla ? 'bn' : 'en']
      const friendlyErrors: Record<string, string> = {
        gemini_api_key_missing: copy.keyMissing,
        http_503: copy.keyMissing,
        gemini_key_or_access_error: copy.keyRejected,
        gemini_model_unavailable: copy.modelUnavailable,
        gemini_quota_exceeded: copy.quotaExceeded,
        gemini_network_error: copy.geminiNetwork,
        gemini_service_unavailable: copy.geminiService,
        gemini_request_failed: copy.geminiFailed,
        gemini_empty_response: copy.geminiFailed,
        http_502: copy.geminiFailed,
        http_404: copy.notFound,
      }
      const friendlyMessage = error instanceof TypeError || errorMessage === 'Failed to fetch'
        ? copy.network
        : friendlyErrors[errorMessage] ?? copy.generic
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: friendlyMessage,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>
      <h2>{bangla ? 'AI ভূমি পরিকল্পনা সহকারী' : 'AI Land Planning Assistant'}</h2>
      <p>
        {bangla
          ? 'Synthetic demo জমির প্রাথমিক উপযোগিতা নিয়ে আলোচনা বা ধারণামূলক পরিকল্পনার জন্য বাংলায় বা ইংরেজিতে প্রশ্ন করুন।'
          : 'Ask in English or Bangla for an initial suitability discussion or conceptual plan for synthetic demo land.'}
      </p>

      <label htmlFor="assistant-land">{bangla ? 'Demo জমি' : 'Demo land'}</label>
      <select
        id="assistant-land"
        value={landId}
        onChange={(event) => setLandId(event.target.value)}
      >
        <option value="BL-001">BL-001</option>
        <option value="BL-002">BL-002</option>
        <option value="BL-003">BL-003</option>
        <option value="BL-004">BL-004</option>
        <option value="BL-005">BL-005</option>
        <option value="BL-006">BL-006</option>
        <option value="BL-007">BL-007</option>
        <option value="BL-008">BL-008</option>
        <option value="BL-009">BL-009</option>
        <option value="BL-010">BL-010</option>
        <option value="BL-011">BL-011</option>
        <option value="BL-012">BL-012</option>
      </select>

      <label htmlFor="assistant-project">{bangla ? 'কী নির্মাণের পরিকল্পনা করছেন?' : 'What are you planning?'}</label>
      <select
        id="assistant-project"
        value={projectType}
        onChange={(event) => setProjectType(event.target.value)}
      >
        <option value="house">{bangla ? 'বাড়ি' : 'House'}</option>
        <option value="industry">{bangla ? 'শিল্পকারখানা' : 'Industry'}</option>
      </select>

      <div aria-live="polite">
        {messages.map((item, index) => (
          <p key={`${item.role}-${index}`}>
            <strong>{item.role === 'user' ? (bangla ? 'আপনি: ' : 'You: ') : 'Assistant: '}</strong>
            {item.text}
          </p>
        ))}
      </div>

      <form onSubmit={sendQuestion}>
        <label htmlFor="assistant-question">{bangla ? 'আপনার প্রশ্ন' : 'Your question'}</label>
        <input
          id="assistant-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={bangla ? 'জমি সম্পর্কে প্রশ্ন করুন...' : 'Ask about this land...'}
        />
        <button type="submit" disabled={loading || !question.trim()}>
          {loading ? (bangla ? 'উত্তর তৈরি হচ্ছে...' : 'Thinking...') : (bangla ? 'প্রশ্ন করুন' : 'Ask assistant')}
        </button>
      </form>

      <small>
        {bangla
          ? 'জমির সব তথ্য synthetic demo। এটি শুধু ধারণামূলক সহায়তা; নির্মাণের আগে মাটি পরীক্ষা, পরিকল্পনা/অনুমতি যাচাই এবং পেশাদার পর্যালোচনা প্রয়োজন।'
          : 'All land data is synthetic demo data. Conceptual guidance only; soil tests, planning and permit checks, and professional review are needed before construction.'}
      </small>
    </section>
  )
}

export default AssistantPanel
