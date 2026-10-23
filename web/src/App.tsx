import { useState } from 'react'
import { Setup } from './Setup'
import { CookView } from './CookView'
import { KitchenManager } from './KitchenManager'
import { Viewer } from './Viewer'
import { Meal } from './Meal'
import './App.css'

type View = 'setup' | 'kitchens' | 'viewer' | 'meal'

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [view, setView] = useState<View>('setup')
  // Bumped whenever we return from the kitchen manager so Setup re-fetches
  // the kitchen list without losing any in-progress recipe selection.
  const [kitchensVersion, setKitchensVersion] = useState(0)

  if (sessionId) {
    return <CookView sessionId={sessionId} onExit={() => setSessionId(null)} />
  }
  if (view === 'kitchens') {
    return (
      <KitchenManager
        onClose={() => {
          setKitchensVersion((v) => v + 1)
          setView('setup')
        }}
      />
    )
  }
  if (view === 'viewer') {
    return <Viewer onExit={() => setView('setup')} onCookMeal={() => setView('meal')} />
  }
  if (view === 'meal') {
    return <Meal onExit={() => setView('viewer')} />
  }
  return (
    <Setup
      onCreated={setSessionId}
      onManageKitchens={() => setView('kitchens')}
      onOpenViewer={() => setView('viewer')}
      kitchensVersion={kitchensVersion}
    />
  )
}
