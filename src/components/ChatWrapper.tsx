'use client'

import dynamic from 'next/dynamic'

// This forces the ChatWindow to ONLY load in the browser.
// The server will see absolutely nothing, which prevents the 418 error.
const DynamicChat = dynamic(() => import('./ChatWindow'), { 
  ssr: false,
  loading: () => <div className="flex-1 bg-[#020617] animate-pulse" /> 
})

export default function ChatWrapper(props: any) {
  return <DynamicChat {...props} />
}
