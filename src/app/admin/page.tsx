'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import './admin.css'

export default function AdminPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [liveStatus, setLiveStatus] = useState<'idle' | 'connecting' | 'live'>('idle')
  const [isMuted, setIsMuted] = useState(true)


  const signalingUrl = 'wss://betel-webrtc-stream-server.onrender.com'

  const createOffer = useCallback(async () => {
    const pc = peerRef.current
    if (!pc) return

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    console.log('[Admin] Sending offer...')
    socketRef.current?.send(JSON.stringify({
      to: 'client',
      payload: offer
    }))
    setLiveStatus('connecting')
  }, [])

  useEffect(() => {
    const ws = new WebSocket(signalingUrl)
    socketRef.current = ws

    ws.onopen = () => {
      console.log('[Admin] WebSocket connected')
      ws.send(JSON.stringify({ type: 'register', role: 'admin' }))
    }

    ws.onmessage = async (event) => {
      const message = JSON.parse(event.data)

      if (message.type === 'answer') {
        console.log('[Admin] Received answer')
        await peerRef.current?.setRemoteDescription(new RTCSessionDescription(message))
      }

      if (message.type === 'candidate') {
        console.log('[Admin] Received ICE candidate')
        await peerRef.current?.addIceCandidate(new RTCIceCandidate(message.candidate))
      }

      if (message.type === 'client-connected') {
        console.log('[Admin] Client connected! Sending offer...')
        createOffer()
      }
    }

    return () => ws.close()
  }, [createOffer])

  useEffect(() => {
    async function loadDevicesWithPermission() {
      try {
        // 1. Cerem acces la cameră fără să o folosim
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true })
        
        // 2. După ce obținem permisiunea, putem citi label-urile
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = devices.filter(d => d.kind === 'videoinput')
        setDevices(videoDevices)
  
        // Setăm prima cameră ca default
        if (videoDevices[0]) {
          setSelectedDeviceId(videoDevices[0].deviceId)
        }
  
        // 3. Oprim camera temporară (ca să nu o blocheze pentru alt stream)
        tempStream.getTracks().forEach(track => track.stop())
      } catch (error) {
        console.error('Camera permission denied or unavailable', error)
      }
    }
  
    loadDevicesWithPermission()
  }, [])
  
  const startCamera = async () => {
    if (!selectedDeviceId) return

    const localStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: selectedDeviceId },
      audio: true
    })

    streamRef.current = localStream
    if (videoRef.current) {
      videoRef.current.srcObject = localStream
    }

    const pc = new RTCPeerConnection()
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream))
    peerRef.current = pc

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.send(JSON.stringify({
          to: 'client',
          payload: {
            type: 'candidate',
            candidate: event.candidate
          }
        }))
      }
    }
  }

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop())
    if (videoRef.current) videoRef.current.srcObject = null
    console.log('[Admin] Camera stopped')
  }

  const stopLive = () => {
    peerRef.current?.close()
    peerRef.current = null
    setLiveStatus('idle')
    console.log('[Admin] Live stopped')
  }

  const toggleMute = () => {
    setIsMuted(prev => !prev)
  }

  return (
    <div className="admin-container">
          {liveStatus === 'connecting' && (
        <div className="status connecting">⏳ Connecting to client...</div>
          )}

          {liveStatus === 'live' && (
            <div className="status live">🟢 Live is ON</div>
          )}

          {liveStatus === 'idle' && (
            <div className="status idle">🔴 Offline</div>
          )}
      <h1>🎥 Betel Live Stream </h1>

      <div className="video-wrapper">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isMuted}
        />

      </div>

      <div className="controls">
        <label>Select Camera:</label>
        <select
          value={selectedDeviceId ?? ''}
          onChange={e => setSelectedDeviceId(e.target.value)}
        >
          {devices.map(device => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Camera ${device.deviceId.slice(-4)}`}
            </option>
          ))}
        </select>

        <div className="buttons">
          <button onClick={startCamera} className="blue">Start Camera</button>
          <button onClick={createOffer} className="green">Start Live</button>
          <button onClick={stopLive} className="yellow">Stop Live</button>
          <button onClick={stopCamera} className="red">Stop Camera</button>
          <button
              onClick={toggleMute}
              className="blue"
            >
              {isMuted ? '🔇 Mute Preview (ON)' : '🔊 Unmute Preview'}
            </button>

        </div>
      </div>
    </div>
  )
}
