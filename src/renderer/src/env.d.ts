import type { ZortexApi } from '../../preload/api'

declare global {
  interface Window {
    zortex: ZortexApi
  }
}

export {}
