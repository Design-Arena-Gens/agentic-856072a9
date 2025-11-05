import { useState, useEffect, useRef } from 'react'
import styles from '../styles/Home.module.css'

export default function Home() {
  const canvasRef = useRef(null)
  const [isRunning, setIsRunning] = useState(false)
  const [sortedCount, setSortedCount] = useState({ red: 0, blue: 0, green: 0, yellow: 0 })
  const animationRef = useRef(null)
  const stateRef = useRef({
    arm: {
      baseX: 400,
      baseY: 500,
      segment1Length: 120,
      segment2Length: 100,
      angle1: -Math.PI / 4,
      angle2: -Math.PI / 3,
      gripperOpen: true,
      heldBox: null
    },
    boxes: [],
    sortingZones: [
      { color: 'red', x: 50, y: 450, width: 80, height: 80 },
      { color: 'blue', x: 150, y: 450, width: 80, height: 80 },
      { color: 'green', x: 250, y: 450, width: 80, height: 80 },
      { color: 'yellow', x: 350, y: 450, width: 80, height: 80 }
    ],
    unsortedArea: { x: 600, y: 400, width: 150, height: 130 },
    state: 'idle',
    targetBox: null,
    targetZone: null
  })

  useEffect(() => {
    initializeBoxes()
  }, [])

  const initializeBoxes = () => {
    const colors = ['red', 'blue', 'green', 'yellow']
    const boxes = []
    for (let i = 0; i < 12; i++) {
      boxes.push({
        id: i,
        color: colors[Math.floor(Math.random() * colors.length)],
        x: 610 + (i % 3) * 45,
        y: 410 + Math.floor(i / 3) * 35,
        width: 30,
        height: 30,
        sorted: false
      })
    }
    stateRef.current.boxes = boxes
  }

  const getArmEndpoint = (arm) => {
    const joint1X = arm.baseX + Math.cos(arm.angle1) * arm.segment1Length
    const joint1Y = arm.baseY + Math.sin(arm.angle1) * arm.segment1Length
    const endX = joint1X + Math.cos(arm.angle1 + arm.angle2) * arm.segment2Length
    const endY = joint1Y + Math.sin(arm.angle1 + arm.angle2) * arm.segment2Length
    return { endX, endY, joint1X, joint1Y }
  }

  const inverseKinematics = (targetX, targetY, arm) => {
    const dx = targetX - arm.baseX
    const dy = targetY - arm.baseY
    const distance = Math.sqrt(dx * dx + dy * dy)

    const maxReach = arm.segment1Length + arm.segment2Length
    const minReach = Math.abs(arm.segment1Length - arm.segment2Length)

    if (distance > maxReach || distance < minReach) {
      return null
    }

    const cosAngle2 = (distance * distance - arm.segment1Length * arm.segment1Length - arm.segment2Length * arm.segment2Length) /
                      (2 * arm.segment1Length * arm.segment2Length)
    const angle2 = -Math.acos(Math.max(-1, Math.min(1, cosAngle2)))

    const k1 = arm.segment1Length + arm.segment2Length * Math.cos(angle2)
    const k2 = arm.segment2Length * Math.sin(angle2)
    const angle1 = Math.atan2(dy, dx) - Math.atan2(k2, k1)

    return { angle1, angle2 }
  }

  const moveArmTowards = (targetAngles, arm, speed = 0.05) => {
    const diff1 = targetAngles.angle1 - arm.angle1
    const diff2 = targetAngles.angle2 - arm.angle2

    arm.angle1 += Math.sign(diff1) * Math.min(Math.abs(diff1), speed)
    arm.angle2 += Math.sign(diff2) * Math.min(Math.abs(diff2), speed)

    return Math.abs(diff1) < 0.01 && Math.abs(diff2) < 0.01
  }

  const update = () => {
    const state = stateRef.current
    const { arm, boxes, sortingZones } = state
    const { endX, endY } = getArmEndpoint(arm)

    if (state.state === 'idle') {
      const unsortedBox = boxes.find(b => !b.sorted)
      if (unsortedBox) {
        state.targetBox = unsortedBox
        state.targetZone = sortingZones.find(z => z.color === unsortedBox.color)
        state.state = 'moving_to_pickup'
        arm.gripperOpen = true
      }
    } else if (state.state === 'moving_to_pickup') {
      const targetAngles = inverseKinematics(
        state.targetBox.x + state.targetBox.width / 2,
        state.targetBox.y + state.targetBox.height / 2,
        arm
      )
      if (targetAngles && moveArmTowards(targetAngles, arm)) {
        state.state = 'picking_up'
        arm.gripperOpen = false
        arm.heldBox = state.targetBox
        state.targetBox.sorted = true
      }
    } else if (state.state === 'picking_up') {
      if (!arm.gripperOpen) {
        state.state = 'moving_to_zone'
      }
    } else if (state.state === 'moving_to_zone') {
      if (arm.heldBox) {
        arm.heldBox.x = endX - arm.heldBox.width / 2
        arm.heldBox.y = endY - arm.heldBox.height / 2
      }

      const targetAngles = inverseKinematics(
        state.targetZone.x + state.targetZone.width / 2,
        state.targetZone.y + state.targetZone.height / 2 - 40,
        arm
      )
      if (targetAngles && moveArmTowards(targetAngles, arm)) {
        state.state = 'placing'
        arm.gripperOpen = true
      }
    } else if (state.state === 'placing') {
      if (arm.heldBox) {
        const zone = state.targetZone
        const boxesInZone = boxes.filter(b =>
          b.color === zone.color &&
          b !== arm.heldBox &&
          b.x >= zone.x && b.x < zone.x + zone.width
        ).length

        arm.heldBox.x = zone.x + 10 + (boxesInZone % 2) * 35
        arm.heldBox.y = zone.y + 10 + Math.floor(boxesInZone / 2) * 35

        setSortedCount(prev => ({
          ...prev,
          [arm.heldBox.color]: prev[arm.heldBox.color] + 1
        }))

        arm.heldBox = null
        state.state = 'idle'
      }
    }
  }

  const draw = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const { arm, boxes, sortingZones, unsortedArea } = stateRef.current

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw background
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw sorting zones
    sortingZones.forEach(zone => {
      ctx.fillStyle = zone.color
      ctx.globalAlpha = 0.2
      ctx.fillRect(zone.x, zone.y, zone.width, zone.height)
      ctx.globalAlpha = 1
      ctx.strokeStyle = zone.color
      ctx.lineWidth = 3
      ctx.strokeRect(zone.x, zone.y, zone.width, zone.height)

      ctx.fillStyle = '#fff'
      ctx.font = '14px Arial'
      ctx.textAlign = 'center'
      ctx.fillText(zone.color.toUpperCase(), zone.x + zone.width / 2, zone.y - 5)
    })

    // Draw unsorted area
    ctx.strokeStyle = '#888'
    ctx.lineWidth = 2
    ctx.setLineDash([5, 5])
    ctx.strokeRect(unsortedArea.x, unsortedArea.y, unsortedArea.width, unsortedArea.height)
    ctx.setLineDash([])
    ctx.fillStyle = '#fff'
    ctx.font = '14px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('UNSORTED', unsortedArea.x + unsortedArea.width / 2, unsortedArea.y - 5)

    // Draw boxes
    boxes.forEach(box => {
      if (box !== arm.heldBox) {
        ctx.fillStyle = box.color
        ctx.fillRect(box.x, box.y, box.width, box.height)
        ctx.strokeStyle = '#000'
        ctx.lineWidth = 2
        ctx.strokeRect(box.x, box.y, box.width, box.height)
      }
    })

    // Draw arm
    const { endX, endY, joint1X, joint1Y } = getArmEndpoint(arm)

    // Base
    ctx.fillStyle = '#555'
    ctx.beginPath()
    ctx.arc(arm.baseX, arm.baseY, 15, 0, Math.PI * 2)
    ctx.fill()

    // Segment 1
    ctx.strokeStyle = '#ff6b6b'
    ctx.lineWidth = 8
    ctx.beginPath()
    ctx.moveTo(arm.baseX, arm.baseY)
    ctx.lineTo(joint1X, joint1Y)
    ctx.stroke()

    // Joint 1
    ctx.fillStyle = '#666'
    ctx.beginPath()
    ctx.arc(joint1X, joint1Y, 10, 0, Math.PI * 2)
    ctx.fill()

    // Segment 2
    ctx.strokeStyle = '#4ecdc4'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(joint1X, joint1Y)
    ctx.lineTo(endX, endY)
    ctx.stroke()

    // Gripper
    ctx.strokeStyle = '#ffe66d'
    ctx.lineWidth = 4
    const gripperSize = arm.gripperOpen ? 15 : 8
    ctx.beginPath()
    ctx.moveTo(endX - gripperSize, endY)
    ctx.lineTo(endX, endY - 10)
    ctx.lineTo(endX + gripperSize, endY)
    ctx.stroke()

    // Draw held box
    if (arm.heldBox) {
      ctx.fillStyle = arm.heldBox.color
      ctx.fillRect(arm.heldBox.x, arm.heldBox.y, arm.heldBox.width, arm.heldBox.height)
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 2
      ctx.strokeRect(arm.heldBox.x, arm.heldBox.y, arm.heldBox.width, arm.heldBox.height)
    }
  }

  const animate = () => {
    if (isRunning) {
      update()
    }
    draw()
    animationRef.current = requestAnimationFrame(animate)
  }

  useEffect(() => {
    animate()
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isRunning])

  const handleStart = () => {
    setIsRunning(true)
  }

  const handleStop = () => {
    setIsRunning(false)
  }

  const handleReset = () => {
    setIsRunning(false)
    setSortedCount({ red: 0, blue: 0, green: 0, yellow: 0 })
    stateRef.current.arm.angle1 = -Math.PI / 4
    stateRef.current.arm.angle2 = -Math.PI / 3
    stateRef.current.arm.gripperOpen = true
    stateRef.current.arm.heldBox = null
    stateRef.current.state = 'idle'
    stateRef.current.targetBox = null
    stateRef.current.targetZone = null
    initializeBoxes()
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Robotic Arm Sorting Simulation</h1>

      <div className={styles.canvasContainer}>
        <canvas
          ref={canvasRef}
          width={800}
          height={600}
          className={styles.canvas}
        />
      </div>

      <div className={styles.controls}>
        <button onClick={handleStart} disabled={isRunning} className={styles.button}>
          Start
        </button>
        <button onClick={handleStop} disabled={!isRunning} className={styles.button}>
          Stop
        </button>
        <button onClick={handleReset} className={styles.button}>
          Reset
        </button>
      </div>

      <div className={styles.stats}>
        <h2>Sorted Count</h2>
        <div className={styles.statsGrid}>
          <div className={styles.stat}>
            <span className={styles.statLabel} style={{ color: 'red' }}>Red:</span>
            <span className={styles.statValue}>{sortedCount.red}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel} style={{ color: 'blue' }}>Blue:</span>
            <span className={styles.statValue}>{sortedCount.blue}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel} style={{ color: 'green' }}>Green:</span>
            <span className={styles.statValue}>{sortedCount.green}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel} style={{ color: 'yellow' }}>Yellow:</span>
            <span className={styles.statValue}>{sortedCount.yellow}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
