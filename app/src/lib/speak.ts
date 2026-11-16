// Audio feedback (haptics and tones).
export function feedback() {
  try {
    if (typeof navigator !== 'undefined') navigator.vibrate?.(40)
  } catch {
    /* not supported */
  }
  try {
    if (typeof window === 'undefined') return
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = 880
    o.frequency.setValueAtTime(880, ctx.currentTime)
    o.frequency.setValueAtTime(1320, ctx.currentTime + 0.08)
    g.gain.setValueAtTime(0.08, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2)
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.2)
    setTimeout(() => ctx.close(), 400)
  } catch {
    /* audio blocked */
  }
}

export function clickFeedback() {
  try {
    if (typeof navigator !== 'undefined') navigator.vibrate?.(10)
  } catch {
    /* not supported */
  }
}

export function speak(text: string, lang = 'hi') {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = lang === 'hi' ? 'hi-IN' : 'en-IN'
    u.rate = 0.95
    window.speechSynthesis.speak(u)
  } catch {
    /* ignore */
  }
}
