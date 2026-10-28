/**
 * Voice input — spec §3.7 (1l), with its three degradation tiers:
 *
 *   unsupported      → `supported` is false; the caller hides the mic (feature detection,
 *                      never an error after the fact)
 *   supported, offline → `offline` is true; the caller disables the mic and says why
 *   failed / timed out → `error` is set; whatever was already heard is KEPT
 *
 * iOS Safari's webkitSpeechRecognition is unreliable, especially inside a home-screen PWA
 * (spec §3.7 平台現實). The keyboard's own dictation key always works there, which is why
 * the quick-entry page is a plain text field first and this is only a shortcut on top.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

// Not every TS DOM lib ships these types, so describe the slice we use.
interface RecognitionResult {
  isFinal: boolean
  0: { transcript: string }
}
interface RecognitionEvent {
  resultIndex: number
  results: ArrayLike<RecognitionResult>
}
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

const ERRORS: Record<string, string> = {
  network: '語音需要網路連線',
  'not-allowed': '沒有麥克風權限，可以改用鍵盤上的麥克風聽寫',
  'service-not-allowed': '這個瀏覽器不允許語音辨識，可以改用鍵盤上的麥克風聽寫',
  'no-speech': '聽不清楚，改用打字？',
  'audio-capture': '找不到麥克風',
}

/**
 * `onText(heard)` receives everything recognised in the current session so far (final plus
 * interim), so the caller can show it live and append it to what was already typed.
 */
export function useSpeechInput(onText: (heard: string) => void) {
  const Ctor = recognitionCtor()
  const supported = !!Ctor
  const listening = ref(false)
  const offline = ref(!navigator.onLine)
  const error = ref<string | null>(null)
  let rec: Recognition | null = null

  const syncOnline = () => (offline.value = !navigator.onLine)
  onMounted(() => {
    window.addEventListener('online', syncOnline)
    window.addEventListener('offline', syncOnline)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('online', syncOnline)
    window.removeEventListener('offline', syncOnline)
    if (rec) discard(rec)
  })

  /** Kill a session outright and make sure none of its late events touch the UI. */
  function discard(r: Recognition) {
    r.onresult = r.onerror = r.onend = null
    try {
      r.abort()
    } catch {
      // Already ended.
    }
    if (rec === r) rec = null
  }

  function start() {
    if (!Ctor || listening.value || offline.value) return
    // A previous session that never reported `end` must not keep writing into the text.
    if (rec) discard(rec)
    error.value = null
    const r = new Ctor()
    rec = r
    r.lang = 'zh-TW'
    r.interimResults = true
    r.continuous = true
    r.onresult = (e) => {
      let heard = ''
      for (let i = 0; i < e.results.length; i++) heard += e.results[i]![0].transcript
      onText(heard)
    }
    r.onerror = (e) => {
      // 'aborted' is our own stop(); not worth a message.
      if (e.error !== 'aborted') error.value = ERRORS[e.error] ?? '聽不清楚，改用打字？'
      listening.value = false
    }
    r.onend = () => {
      listening.value = false
      if (rec === r) rec = null
    }
    try {
      r.start()
      listening.value = true
    } catch {
      error.value = '無法啟動語音，可以改用鍵盤上的麥克風聽寫'
      rec = null
    }
  }

  /**
   * Finish on our side immediately. iOS Safari often never fires `end` after stop() in
   * continuous mode, and waiting for it is what left the mic stuck on 「正在聽」 with a
   * second tap doing nothing. The session still gets a moment to deliver its final
   * transcript; if it hasn't ended by then, it's aborted.
   */
  function stop() {
    listening.value = false
    const r = rec
    if (!r) return
    try {
      r.stop()
    } catch {
      // Already ended.
    }
    setTimeout(() => {
      if (rec === r) discard(r)
    }, 1500)
  }

  return { supported, listening, offline, error, start, stop }
}
