'use client'

import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Gamepad2, Mail, Lock, User, CheckCircle2, AlertCircle } from 'lucide-react'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [specialId, setSpecialId] = useState('')
  const [fullName, setFullName] = useState('')
  const [country, setCountry] = useState('India')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ text: '', type: '' })

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage({ text: '', type: '' })

    try {
      if (isSignUp) {
        const cleanId = specialId.toLowerCase().replace('@', '').trim()
        
        // 1. Sign up the user AND pass the profile data as "metadata"
        const { data: authData, error: authError } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            data: {
              display_name: fullName || cleanId,
              special_id: `@${cleanId}`,
              country: country
            }
          }
        })
        
        if (authError) throw authError

        // We DO NOT manually insert into 'profiles' here anymore! 
        // The backend trigger handles it instantly and securely.

        setMessage({ text: 'Account created! Log in to enter the arena.', type: 'success' })
        setIsSignUp(false)
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        window.location.href = '/dashboard'
      }
    } catch (error: any) {
      setMessage({ text: error.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] transition-colors duration-500 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-[#0f172a] rounded-[2rem] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-8 text-center bg-slate-100 dark:bg-slate-900/50">
          <Gamepad2 className="w-12 h-12 mx-auto text-indigo-600 mb-2" />
          <h1 className="text-3xl font-black text-slate-900 dark:text-white">Royal Arcade</h1>
        </div>

        <form onSubmit={handleAuth} className="p-8 space-y-4">
          {isSignUp && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Special ID</label>
                  <input type="text" required value={specialId} onChange={(e) => setSpecialId(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="@ID"/>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Full Name</label>
                  <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Saad..."/>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Country</label>
                <select value={country} onChange={(e) => setCountry(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-white outline-none">
                  <option value="India">India</option>
                  <option value="USA">USA</option>
                  <option value="UAE">UAE</option>
                </select>
              </div>
            </>
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-white outline-none" placeholder="you@example.com"/>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-white outline-none" placeholder="••••••••"/>
          </div>

          {message.text && (
            <div className={`p-3 rounded-lg text-xs font-bold flex items-center ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 mr-2"/> : <AlertCircle className="w-4 h-4 mr-2"/>}
              {message.text}
            </div>
          )}

          <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-xl shadow-lg transition-all active:scale-95">
            {loading ? 'Processing...' : (isSignUp ? 'CREATE PROFILE' : 'ENTER ARENA')}
          </button>
        </form>

        <button onClick={() => setIsSignUp(!isSignUp)} className="w-full p-6 text-slate-500 dark:text-slate-400 text-sm font-medium border-t border-slate-100 dark:border-slate-800 hover:text-indigo-500">
          {isSignUp ? 'Already a member? Log In' : 'New here? Sign Up Free'}
        </button>
      </div>
    </div>
  )
}