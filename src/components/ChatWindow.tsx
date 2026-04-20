'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { io } from 'socket.io-client'
import { ARCADE_GAMES } from '../lib/arcadeGames'
import { ChevronLeft, Send, Gamepad2 } from 'lucide-react'
import UserProfile from './UserProfile'

const SOCKET_URL = 'https://engine.theroyalfoundation.org.in'

export default function ChatWindow({ activeChat, authUser, onClose, showToast }: any) {

  const [messages, setMessages] = useState<any[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [showGameMenu, setShowGameMenu] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [hasMounted, setHasMounted] = useState(false)

  const messagesEndRef = useRef<any>(null)
  const socketRef = useRef<any>(null)

  const roomName = `chat_${[authUser?.id, activeChat?.id].sort().join('_')}`

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    setHasMounted(true)
  }, [])

  // LOAD HISTORY
  useEffect(() => {
    if (!activeChat || !authUser) return

    const loadMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${authUser.id},receiver_id.eq.${activeChat.id}),and(sender_id.eq.${activeChat.id},receiver_id.eq.${authUser.id})`)
        .order('created_at', { ascending: true })

      setMessages(data || [])
      setTimeout(scrollToBottom, 100)
    }

    loadMessages()
  }, [activeChat?.id])

  // SOCKET INIT (ONLY ONCE)
  useEffect(() => {
    if (!authUser) return

    socketRef.current = io(SOCKET_URL, {
      path: '/chat-socket/',
      transports: ['websocket']
    })

    return () => {
      socketRef.current?.disconnect()
    }
  }, [])

  // JOIN ROOM
  useEffect(() => {
    if (!socketRef.current || !roomName) return

    socketRef.current.emit('join_room', roomName)

    socketRef.current.on('receive_message', (msg: any) => {
      setMessages(prev => {
        if (prev.find(m => m.id === msg.id)) return prev
        return [...prev, msg]
      })
      scrollToBottom()
    })

    socketRef.current.on('typing_status', (data: any) => {
      if (data.userId === activeChat.id) setIsTyping(data.isTyping)
    })

    return () => {
      socketRef.current.off('receive_message')
      socketRef.current.off('typing_status')
    }
  }, [roomName])

  const handleTyping = (e: any) => {
    setChatInput(e.target.value)
    socketRef.current?.emit('typing', {
      room: roomName,
      userId: authUser.id,
      isTyping: e.target.value.length > 0
    })
  }

  const sendMessage = async (e: any) => {
    e.preventDefault()
    if (!chatInput.trim()) return

    const newMsg = {
      id: crypto.randomUUID(),
      sender_id: authUser.id,
      receiver_id: activeChat.id,
      content: chatInput,
      created_at: new Date().toISOString()
    }

    setMessages(prev => [...prev, newMsg])

    socketRef.current.emit('send_message', {
      room: roomName,
      message: newMsg
    })

    await supabase.from('messages').insert([newMsg])

    socketRef.current.emit('typing', {
      room: roomName,
      userId: authUser.id,
      isTyping: false
    })

    setChatInput('')
    scrollToBottom()
  }

  if (!hasMounted) return null

  return (
    <div className="absolute inset-0 bg-[#020617] flex flex-col">

      {/* HEADER */}
      <div className="p-4 flex items-center gap-3 border-b border-slate-800">
        <button onClick={onClose}><ChevronLeft /></button>
        <div onClick={() => setShowProfile(true)} className="cursor-pointer">
          <img src={activeChat.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${activeChat.id}`} className="w-10 h-10 rounded" />
        </div>
        <div>
          <h2 className="text-white">{activeChat.display_name}</h2>
          {isTyping && <p className="text-green-400 text-xs">Typing...</p>}
        </div>
      </div>

      {/* CHAT */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map(msg => (
          <div key={msg.id} className={`mb-2 flex ${msg.sender_id === authUser.id ? 'justify-end' : 'justify-start'}`}>
            <div className={`p-3 rounded-lg ${msg.sender_id === authUser.id ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT */}
      <form onSubmit={sendMessage} className="flex p-3 gap-2 border-t border-slate-800">
        <button type="button" onClick={() => setShowGameMenu(!showGameMenu)}>
          <Gamepad2 />
        </button>
        <input
          value={chatInput}
          onChange={handleTyping}
          className="flex-1 p-2 rounded bg-slate-800 text-white"
          placeholder="Type message..."
        />
        <button type="submit">
          <Send />
        </button>
      </form>

      {showProfile && <UserProfile user={activeChat} onClose={() => setShowProfile(false)} />}
    </div>
  )
}
