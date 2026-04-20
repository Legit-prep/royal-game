'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import ChatWindow from '../../components/ChatWindow'
import ClientOnly from '../../components/ClientOnly' // <-- IMPORT THE SHIELD
import { Search, LogOut, Swords, Camera, X, Upload, UserPlus, Gamepad2, Users, Check, Clock, UserMinus, MessageSquare } from 'lucide-react'

export default function Dashboard() {
  const router = useRouter()
  const [authUser, setAuthUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error' | ''}>({ message: '', type: '' })
  const [activeTab, setActiveTab] = useState<'arena' | 'friends'>('arena')
  const [friendTab, setFriendTab] = useState<'all' | 'requested' | 'requests'>('all')

  const [showEdit, setShowEdit] = useState(false)
  const [newName, setNewName] = useState('')
  const [uploading, setUploading] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [friendships, setFriendships] = useState<any[]>([])
  const [activeChat, setActiveChat] = useState<any>(null) 

  const showToast = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type })
    setTimeout(() => setNotification({ message: '', type: '' }), 3500)
  }

  useEffect(() => { fetchUserData() }, [])

  useEffect(() => {
    const searchFriends = async () => {
      if (!searchQuery.trim()) { setSearchResults([]); setIsSearching(false); return; }
      setIsSearching(true)
      const { data } = await supabase.from('profiles').select('*').ilike('special_id', `%${searchQuery}%`).neq('id', authUser?.id).limit(5)
      if (data) setSearchResults(data)
      setIsSearching(false)
    }
    const delayDebounceFn = setTimeout(() => { if (authUser) searchFriends() }, 300)
    return () => clearTimeout(delayDebounceFn)
  }, [searchQuery, authUser])

  const fetchUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/game'); return; }
    setAuthUser(user)
    
    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (profileData) { setProfile(profileData); setNewName(profileData.display_name); }
    
    await fetchFriendships(user.id)
    setLoading(false)
  }

  const fetchFriendships = async (userId: string) => {
    const { data } = await supabase
      .from('friendships')
      .select(`id, status, user_id, friend_id, sender:profiles!user_id(*), receiver:profiles!friend_id(*)`)
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
    if (data) setFriendships(data)
  }

  const sendFriendRequest = async (friendId: string) => {
    if (!authUser) return
    const { error } = await supabase.from('friendships').insert([{ user_id: authUser.id, friend_id: friendId, status: 'pending' }])
    if (!error) { showToast('Friend request sent!', 'success'); fetchFriendships(authUser.id); setSearchQuery(''); } 
    else { showToast('Request already pending or friends.', 'error') }
  }

  const handleFriendAction = async (friendshipId: string, action: 'accept' | 'cancel' | 'remove') => {
    if (action === 'accept') {
      await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId)
      showToast('Request accepted!', 'success')
    } else {
      await supabase.from('friendships').delete().eq('id', friendshipId)
      if (action === 'remove' && activeChat) setActiveChat(null) 
      showToast(`Request ${action === 'cancel' ? 'cancelled' : 'removed'}.`, 'success')
    }
    fetchFriendships(authUser.id)
  }

  const handleImageUpload = async (event: any) => {
    try {
      setUploading(true)
      const file = event.target.files[0]
      if (!file || !authUser) return
      const fileExt = file.name.split('.').pop()
      const fileName = `${authUser.id}-${Math.random()}.${fileExt}`
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file)
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName)
      await supabase.from('profiles').upsert({ id: authUser.id, avatar_url: publicUrl })
      setProfile({ ...profile, avatar_url: publicUrl })
      showToast('Profile picture updated!', 'success')
    } catch (error: any) { showToast('Upload failed: ' + error.message, 'error') } 
    finally { setUploading(false) }
  }

  const saveProfile = async () => {
    if (!newName.trim() || !authUser) return
    const { error } = await supabase.from('profiles').upsert({ id: authUser.id, display_name: newName })
    if (!error) { setProfile({ ...profile, display_name: newName }); setShowEdit(false); showToast('Profile saved!', 'success') }
  }

  if (loading) return <div className="min-h-screen bg-[#020617] flex items-center justify-center text-indigo-500 font-bold animate-pulse text-2xl">LOADING ARENA...</div>

  const avatarSrc = profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${authUser?.id || 'fallback'}`
  const allFriends = friendships.filter(f => f.status === 'accepted')
  const requested = friendships.filter(f => f.status === 'pending' && f.user_id === authUser?.id)
  const requests = friendships.filter(f => f.status === 'pending' && f.friend_id === authUser?.id)

  return (
    <div className="min-h-screen bg-[#020617] text-white flex relative overflow-hidden">
      
      {notification.message && (
        <div className={`fixed top-8 left-1/2 transform -translate-x-1/2 z-[100] px-6 py-3 rounded-full shadow-2xl flex items-center font-bold text-sm animate-in slide-in-from-top-5 duration-300 ${notification.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}>
          {notification.type === 'success' ? <Check className="w-4 h-4 mr-2" /> : <X className="w-4 h-4 mr-2" />}
          {notification.message}
        </div>
      )}

      {/* SIDEBAR */}
      <div className="w-80 bg-[#0f172a] border-r border-slate-800 flex flex-col shadow-xl z-20">
        <div className="p-8 border-b border-slate-800 relative">
          <div className="relative mx-auto w-28 h-28 mb-4 mt-4">
            <img src={avatarSrc} className="w-full h-full rounded-3xl object-cover border-4 border-slate-800 shadow-lg bg-slate-900" alt="avatar" />
            <button onClick={() => setShowEdit(true)} className="absolute -bottom-2 -right-2 bg-indigo-600 p-2.5 rounded-xl border-4 border-[#0f172a] hover:scale-105 transition shadow-lg"><Camera className="w-4 h-4" /></button>
          </div>
          <div className="text-center mt-6">
            <h2 className="text-2xl font-black">{profile?.display_name || 'Anonymous Player'}</h2>
            <p className="text-indigo-500 font-mono text-sm font-bold mt-1">{profile?.special_id || '@unknown'}</p>
          </div>
        </div>

        <div className="p-4 space-y-2">
          <button onClick={() => {setActiveTab('arena'); setActiveChat(null)}} className={`w-full flex items-center p-4 rounded-2xl font-bold transition ${activeTab === 'arena' && !activeChat ? 'bg-indigo-600 shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:bg-slate-800'}`}><Swords className="w-5 h-5 mr-3" /> The Arena</button>
          <button onClick={() => {setActiveTab('friends'); setActiveChat(null)}} className={`w-full flex items-center justify-between p-4 rounded-2xl font-bold transition ${(activeTab === 'friends' || activeChat) ? 'bg-indigo-600 shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:bg-slate-800'}`}>
            <div className="flex items-center"><Users className="w-5 h-5 mr-3" /> Friends Hub</div>
            {requests.length > 0 && <span className="bg-red-500 text-white text-[10px] px-2 py-1 rounded-full animate-bounce">{requests.length}</span>}
          </button>
        </div>

        <div className="p-6 flex-1 flex flex-col justify-end">
          <button onClick={async () => { await supabase.auth.signOut(); router.push('/game') }} className="w-full flex items-center justify-center p-4 bg-red-500/10 text-red-500 rounded-2xl font-bold hover:bg-red-500 hover:text-white transition group"><LogOut className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" /> Sign Out</button>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col relative">
        
        {/* THE PERFECT CLIENT-ONLY WRAPPER */}
        {activeChat && (
          <ClientOnly>
            <ChatWindow 
              activeChat={activeChat} 
              authUser={authUser} 
              onClose={() => setActiveChat(null)} 
              showToast={showToast} 
            />
          </ClientOnly>
        )}

        {!activeChat && (
          <div className="flex-1 flex flex-col h-full overflow-y-auto">
            {activeTab === 'arena' ? (
              <>
                <div className="p-8 border-b border-slate-800 bg-[#0f172a]/50 backdrop-blur-md sticky top-0 z-0">
                  <div className="max-w-3xl mx-auto w-full relative">
                    <div className="w-full bg-slate-900 border border-slate-700 rounded-2xl flex items-center px-4 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500 transition">
                      <Search className={`w-5 h-5 mr-3 ${isSearching ? 'text-indigo-500 animate-pulse' : 'text-slate-400'}`} />
                      <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search to challenge or add friends..." className="w-full bg-transparent py-4 outline-none font-medium text-white" />
                    </div>
                    {searchQuery.trim() && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden z-50">
                        {searchResults.length > 0 ? (
                          <div>
                            {searchResults.map((user) => {
                              const existingReq = friendships.find(f => (f.user_id === user.id || f.friend_id === user.id))
                              return (
                                <div key={user.id} className="flex items-center justify-between p-4 hover:bg-slate-800 transition border-b border-slate-800/50 last:border-0">
                                  <div className="flex items-center gap-4">
                                    <img src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`} className="w-10 h-10 rounded-full bg-slate-800 object-cover" />
                                    <div><p className="font-bold text-sm text-white">{user.display_name}</p><p className="text-indigo-500 text-xs font-mono">{user.special_id}</p></div>
                                  </div>
                                  {existingReq ? (
                                    <span className="text-xs font-bold text-slate-400 bg-slate-800 px-3 py-1.5 rounded-lg">{existingReq.status === 'accepted' ? 'Friends' : 'Pending'}</span>
                                  ) : (
                                    <button onClick={() => sendFriendRequest(user.id)} className="flex items-center bg-indigo-500/10 hover:bg-indigo-600 text-indigo-400 hover:text-white px-4 py-2 rounded-lg text-xs font-bold transition">
                                      <UserPlus className="w-4 h-4 mr-1" /> Request
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        ) : <div className="p-6 text-center text-slate-500 text-sm">{isSearching ? 'Scanning database...' : 'No players found.'}</div>}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center p-8">
                  <div className="mt-10 text-center">
                    <div className="w-24 h-24 bg-indigo-500/10 rounded-[2rem] flex items-center justify-center mx-auto mb-6"><Gamepad2 className="w-12 h-12 text-indigo-500" /></div>
                    <h1 className="text-4xl font-black mb-4 tracking-tight text-white">THE ARENA IS QUIET</h1>
                    <p className="text-slate-500 text-lg font-medium max-w-md mx-auto">Use the search bar above to find opponents across the globe.</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-8 max-w-4xl mx-auto w-full">
                <h1 className="text-3xl font-black mb-8 flex items-center text-white"><Users className="w-8 h-8 mr-4 text-indigo-500" /> Friends Hub</h1>
                <div className="flex space-x-2 bg-slate-800/50 p-1.5 rounded-2xl mb-8">
                  <button onClick={() => setFriendTab('all')} className={`flex-1 py-3 rounded-xl font-bold text-sm transition ${friendTab === 'all' ? 'bg-slate-900 shadow text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}>All Friends ({allFriends.length})</button>
                  <button onClick={() => setFriendTab('requests')} className={`flex-1 py-3 rounded-xl font-bold text-sm transition flex items-center justify-center ${friendTab === 'requests' ? 'bg-slate-900 shadow text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}>
                    Requests {requests.length > 0 && <span className="ml-2 bg-red-500 text-white px-2 py-0.5 rounded-full text-[10px] animate-pulse">{requests.length}</span>}
                  </button>
                  <button onClick={() => setFriendTab('requested')} className={`flex-1 py-3 rounded-xl font-bold text-sm transition ${friendTab === 'requested' ? 'bg-slate-900 shadow text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}>Requested ({requested.length})</button>
                </div>
                
                <div className="space-y-4">
                  {friendTab === 'all' && allFriends.map(f => {
                    const other = f.user_id === authUser.id ? f.receiver : f.sender
                    return (
                      <div key={f.id} onClick={() => setActiveChat(other)} className="flex items-center justify-between p-4 bg-[#0f172a] rounded-2xl border border-slate-800 shadow-sm hover:border-indigo-500/50 cursor-pointer transition group">
                        <div className="flex items-center gap-4">
                          <img src={other.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${other.id}`} className="w-12 h-12 rounded-xl object-cover bg-slate-800" />
                          <div><p className="font-bold text-white">{other.display_name}</p><p className="text-indigo-500 text-xs font-mono">{other.special_id}</p></div>
                        </div>
                        <div className="flex gap-2 items-center">
                          <span className="text-slate-400 group-hover:text-indigo-400 transition flex items-center text-sm font-bold bg-slate-900 px-4 py-2 rounded-xl"><MessageSquare className="w-4 h-4 mr-2"/> Chat</span>
                          <button onClick={(e) => {e.stopPropagation(); handleFriendAction(f.id, 'remove')}} className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition" title="Remove Friend"><UserMinus className="w-5 h-5" /></button>
                        </div>
                      </div>
                    )
                  })}
                  
                  {friendTab === 'requests' && requests.map(f => (
                    <div key={f.id} className="flex items-center justify-between p-4 bg-[#0f172a] rounded-2xl border border-indigo-500/30 shadow-md">
                      <div className="flex items-center gap-4">
                        <img src={f.sender.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.sender.id}`} className="w-12 h-12 rounded-xl object-cover bg-slate-800" />
                        <div><p className="font-bold text-white">{f.sender.display_name}</p><p className="text-indigo-500 text-xs font-mono">{f.sender.special_id}</p></div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleFriendAction(f.id, 'accept')} className="flex items-center bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition"><Check className="w-4 h-4 mr-1" /> Accept</button>
                        <button onClick={() => handleFriendAction(f.id, 'cancel')} className="flex items-center bg-slate-800 text-slate-300 hover:bg-red-500/20 hover:text-red-400 px-4 py-2 rounded-xl text-sm font-bold transition"><X className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}

                  {friendTab === 'requested' && requested.map(f => (
                    <div key={f.id} className="flex items-center justify-between p-4 bg-[#0f172a] rounded-2xl border border-slate-800 shadow-sm opacity-70">
                      <div className="flex items-center gap-4">
                        <img src={f.receiver.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.receiver.id}`} className="w-12 h-12 rounded-xl object-cover bg-slate-800" />
                        <div><p className="font-bold text-white">{f.receiver.display_name}</p><p className="text-slate-500 text-xs font-mono">{f.receiver.special_id}</p></div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="flex items-center text-xs font-bold text-amber-500"><Clock className="w-4 h-4 mr-1" /> Pending</span>
                        <button onClick={() => handleFriendAction(f.id, 'cancel')} className="bg-slate-800 hover:bg-red-500/20 hover:text-red-500 p-2 rounded-lg text-slate-500 transition"><X className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* EDIT MODAL */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0f172a] w-full max-w-sm rounded-[2.5rem] p-8 relative border border-slate-800 shadow-2xl animate-in zoom-in-95 duration-200">
            <button onClick={() => setShowEdit(false)} className="absolute top-6 right-6 text-slate-400 hover:text-white"><X /></button>
            <h2 className="text-2xl font-black mb-6 text-white">Profile Setup</h2>
            <div className="space-y-6">
              <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-700 rounded-3xl bg-slate-900/50">
                <img src={avatarSrc} className="w-20 h-20 rounded-2xl object-cover mb-4 shadow-md bg-slate-800" />
                <label className="cursor-pointer bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 px-6 py-2 rounded-full text-sm font-bold transition flex items-center">
                  <Upload className="w-4 h-4 mr-2" /> {uploading ? 'Uploading...' : 'Upload Picture'}
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
                </label>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Display Name</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 outline-none focus:ring-2 focus:ring-indigo-500 text-white font-medium" />
              </div>
              <button onClick={saveProfile} className="w-full bg-indigo-600 text-white py-4 rounded-[1.5rem] font-black uppercase hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-500/20">SAVE CHANGES</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
