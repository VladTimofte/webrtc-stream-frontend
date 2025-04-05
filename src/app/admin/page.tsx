/* eslint-disable @typescript-eslint/no-unused-vars */
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

export default function AdminPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)

  const signalingUrl = 'ws://localhost:3001'

  const createOffer = useCallback(async () => {
    const pc = peerRef.current
    if (!pc) {
      console.warn('PeerConnection not ready')
      return
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    console.log('[Admin] Sending offer...')
    socketRef.current?.send(JSON.stringify({
      to: 'client',
      payload: offer
    }))
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

  const startCamera = async () => {
    const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    setStream(localStream)

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

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Admin Live Stream</h1>

      <video ref={videoRef} autoPlay playsInline className="mt-4 w-full max-w-xl border rounded" />

      <button
        onClick={startCamera}
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
      >
        Start Camera
      </button>

      <button
        onClick={createOffer}
        className="mt-2 px-4 py-2 bg-green-600 text-white rounded"
      >
        Start Live
      </button>
    </div>
  )
}
