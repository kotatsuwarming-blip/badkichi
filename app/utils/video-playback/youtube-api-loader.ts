const IFRAME_API_SRC = 'https://www.youtube.com/iframe_api'

let loadPromise: Promise<typeof YT> | null = null

export function ensureApiLoaded(): Promise<typeof YT> {
  if (loadPromise) {
    return loadPromise
  }

  loadPromise = new Promise<typeof YT>((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT)
      return
    }

    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve(window.YT)
    }

    if (!document.querySelector(`script[src="${IFRAME_API_SRC}"]`)) {
      const script = document.createElement('script')
      script.src = IFRAME_API_SRC
      document.head.appendChild(script)
    }
  })

  return loadPromise
}
