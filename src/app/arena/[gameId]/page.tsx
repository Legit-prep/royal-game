'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import * as Colyseus from 'colyseus.js'
import { ChevronLeft, Gamepad2, Loader2 } from 'lucide-react'

// Change this to your AWS EC2 IP later (e.g., 'ws://3.14.xx.xx:2567')
const COLYSEUS_URL = 'https://13.206.85.4/' 

export default function ArcadeArena() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  
  const gameId = params.gameId as string
  const matchId = searchParams.get('match') // e.g., chat_uuid1_uuid2
  
  const [room, setRoom] = useState<Colyseus.Room | null>(null)
  const [status, setStatus] = useState('Initializing Engine...')

  useEffect(() => {
    // 1. Initialize Colyseus Client
    const client = new Colyseus.Client(COLYSEUS_URL)

    const connectToGame = async () => {
      try {
        setStatus(`Connecting to ${gameId.toUpperCase()} server...`)
        
        // 2. Join or Create the Room based on the unique chat match ID
        const joinedRoom = await client.joinOrCreate(gameId, { matchId: matchId })
        setRoom(joinedRoom)
        setStatus('Connected! Waiting for opponent...')

        // 3. Listen for Server Messages
        joinedRoom.onMessage("start_game", () => {
            setStatus('Game Started!')
        })

      } catch (e: any) {
        setStatus(`Connection Failed: Make sure your Colyseus server is running. (${e.message})`)
      }
    }

    connectToGame()

    // Cleanup: Leave room if they click back
    return () => {
      if (room) room.leave()
    }
  }, [gameId, matchId])

  return (
    <div className="min-h-screen bg-[#020617] text-white flex flex-col">
      {/* ARENA HEADER */}
      <div className="p-6 border-b border-slate-800 bg-[#0f172a] flex items-center justify-between shadow-md z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition text-slate-400">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div>
            <h2 className="font-black text-xl text-white uppercase tracking-wider">{gameId} ARENA</h2>
            <p className="text-indigo-400 text-xs font-mono">Match: {matchId}</p>
          </div>
        </div>
      </div>

      {/* GAME CANVAS AREA */}
      <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden">
        <Gamepad2 className="absolute w-96 h-96 text-indigo-500/5 z-0" />

        {status !== 'Game Started!' ? (
            <div className="z-10 flex flex-col items-center bg-slate-900/80 p-8 rounded-3xl border border-slate-800 backdrop-blur-sm shadow-2xl animate-in zoom-in-95">
                <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
                <h1 className="text-2xl font-black mb-2 text-white">ARENA LOADING</h1>
                <p className="text-slate-400 font-bold">{status}</p>
            </div>
        ) : (
            <div className="z-10 w-full h-full p-8 flex items-center justify-center">
                <div className="w-full max-w-4xl aspect-video bg-slate-900 border-2 border-indigo-500 rounded-2xl shadow-2xl shadow-indigo-500/20 flex flex-col items-center justify-center">
                    <h1 className="text-5xl font-black text-indigo-500 mb-4">{gameId.toUpperCase()}</h1>
                    <p className="text-slate-400 font-bold tracking-widest uppercase">Canvas Engine Ready</p>
                </div>
            </div>
        )}
      </div>
    </div>
  )
}