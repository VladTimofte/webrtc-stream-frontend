'use client'

import { useEffect, useRef } from 'react'

export default function ClientPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const signalingUrl = 'ws://betel-webrtc-stream-server.onrender.com'

  useEffect(() => {
    const socket = new WebSocket(signalingUrl)
    socketRef.current = socket

    socket.onopen = () => {
      console.log('[Client] WebSocket connected')
      socket.send(JSON.stringify({ type: 'register', role: 'client' }))
    }

    socket.onerror = (err) => {
      console.error('[Client] WebSocket error:', err)
    }

    socket.onmessage = async (event) => {
      const message = JSON.parse(event.data)
      console.log('[Client] Received:', message)

      if (message.type === 'offer') {
        console.log('[Client] Received offer')
        const pc = new RTCPeerConnection()

        peerRef.current = pc

        pc.ontrack = (event) => {
          console.log('[Client] Received track:', event.streams)
          if (videoRef.current) {
            videoRef.current.srcObject = event.streams[0]
          } else {
            console.warn('[Client] videoRef is null!')
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
        console.log('[Client] ICE candidate')
        await peerRef.current?.addIceCandidate(new RTCIceCandidate(message.candidate))
      }
    }

    return () => socket.close()
  }, [])

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Client View</h1>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="mt-4 w-full max-w-xl border rounded bg-black"
      />
    </div>
  )
}
