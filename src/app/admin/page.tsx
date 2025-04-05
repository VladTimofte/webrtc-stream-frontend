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
  const [isLive, setIsLive] = useState(false)

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
    setIsLive(true)
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
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const videoDevices = devices.filter(d => d.kind === 'videoinput')
      setDevices(videoDevices)
      if (videoDevices[0]) {
        setSelectedDeviceId(videoDevices[0].deviceId)
      }
    })
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
    setIsLive(false)
    console.log('[Admin] Live stopped')
  }

  return (
    <div className="admin-container">
          {isLive && (
            <div className="live-indicator">
              🟢 LIVE
            </div>
          )}
          {!isLive && (
            <div className="live-indicator off">
              🔴 OFFLINE
            </div>
          )}
      <h1>🎥 Betel Live Stream </h1>

      <div className="video-wrapper">
        <video ref={videoRef} autoPlay playsInline muted />
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
        </div>
      </div>
    </div>
  )
}
