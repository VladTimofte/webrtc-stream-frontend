'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

export default function AdminPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)

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
    console.log('[Admin] Live stopped')
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-start p-6">
      <div className="w-full max-w-2xl space-y-6">
        <h1 className="text-3xl font-bold text-center text-gray-800">🎥 Admin Live Stream</h1>

        <div className="rounded-xl overflow-hidden border border-gray-300 bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-[360px] object-contain bg-black"
          />
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <label className="text-sm font-medium text-gray-700">Select Camera:</label>
          <select
            className="w-full sm:w-auto border p-2 rounded bg-white text-gray-800"
            value={selectedDeviceId ?? ''}
            onChange={e => setSelectedDeviceId(e.target.value)}
          >
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Camera ${device.deviceId.slice(-4)}`}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            onClick={startCamera}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium"
          >
            Start Camera
          </button>

          <button
            onClick={createOffer}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium"
          >
            Start Live
          </button>

          <button
            onClick={stopLive}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded font-medium"
          >
            Stop Live
          </button>

          <button
            onClick={stopCamera}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium"
          >
            Stop Camera
          </button>
        </div>
      </div>
    </div>
  )
}
