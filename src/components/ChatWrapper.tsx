'use client'

import dynamic from 'next/dynamic'

const DynamicChat = dynamic(() => import('./ChatWindow'), { 
  ssr: false, // This kills the Hydration Error #418 forever
  loading: () => (
    <div className="flex-1 bg-[#020617] flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  )
})

export default function ChatWrapper(props: any) {
  return <DynamicChat {...props} />
}
