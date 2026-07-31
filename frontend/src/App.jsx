import { useState } from 'react'

export default function App() {
  const [name, setName] = useState('')
  const [result, setResult] = useState(null)

  async function handleGreet() {
    const res = await fetch('/api/greet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setResult(await res.json())
  }

  return (
    <div>
      <h1>Greeter</h1>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <button onClick={handleGreet}>Greet</button>
      {result && (
        <div>
          <p>{result.message}</p>
          <p>{result.timestamp}</p>
        </div>
      )}
    </div>
  )
}
