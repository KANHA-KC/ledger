'use client'

import {
  useRouter as useNextRouter,
  useSearchParams as useNextSearchParams,
  useParams as useNextParams,
  usePathname as useNextPathname,
} from 'next/navigation'

export function useNavigate() {
  const router = useNextRouter()
  return (to: string | number) => {
    if (typeof to === 'number') {
      if (to === -1) router.back()
    } else {
      router.push(to)
    }
  }
}

export function useSearchParams(): [URLSearchParams, (params: URLSearchParams) => void] {
  const sp = useNextSearchParams()
  const router = useNextRouter()
  const pathname = useNextPathname()

  const setSearchParams = (next: URLSearchParams) => {
    const qs = next.toString()
    router.push(`${pathname}${qs ? `?${qs}` : ''}`)
  }

  // Next.js searchParams can be read-only URLSearchParams
  const params = new URLSearchParams(sp ? sp.toString() : '')
  return [params, setSearchParams]
}

export function useParams<T extends Record<string, string | string[]>>() {
  return useNextParams() as T
}

export function useLocation() {
  const pathname = useNextPathname()
  const searchParams = useNextSearchParams()
  return {
    pathname,
    search: searchParams?.toString() ? `?${searchParams.toString()}` : '',
  }
}
