'use client'

import { useEffect, useRef, useState } from 'react'
import './client.css'

export default function ClientPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const signalingUrl = 'wss://betel-webrtc-stream-server.onrender.com'

  useEffect(() => {
    const socket = new WebSocket(signalingUrl)
    socketRef.current = socket

    socket.onopen = () => {
      console.log('[Client] WebSocket connected')
      socket.send(JSON.stringify({ type: 'register', role: 'client' }))
    }

    socket.onmessage = async (event) => {
      const message = JSON.parse(event.data)

      if (message.type === 'offer') {
        console.log('[Client] Received offer')
        const pc = new RTCPeerConnection()
        peerRef.current = pc

        pc.ontrack = (event) => {
          console.log('[Client] Receiving track...')
          if (videoRef.current) {
            videoRef.current.srcObject = event.streams[0]
          }
        }

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socketRef.current?.send(JSON.stringify({
              to: 'admin',
              payload: {
                type: 'candidate',
                candidate: event.candidate,
              }
            }))
          }
        }

        await pc.setRemoteDescription(new RTCSessionDescription(message))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        socketRef.current?.send(JSON.stringify({
          to: 'admin',
          payload: answer
        }))
      }

      if (message.type === 'candidate') {
        await peerRef.current?.addIceCandidate(new RTCIceCandidate(message.candidate))
      }
    }

    return () => socket.close()
  }, [])

  const handleFullscreen = () => {
    const video = videoRef.current
    if (!video) return

    if (!document.fullscreenElement) {
      video.requestFullscreen().then(() => setIsFullscreen(true))
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false))
    }
  }

  return (
    <div className="client-container">
      <video ref={videoRef} autoPlay playsInline muted className="client-video" />
      <button className="fullscreen-button" onClick={handleFullscreen}>
        {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
      </button>
    </div>
  )
}
