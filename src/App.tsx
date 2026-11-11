import { Navigate, Route, Routes } from 'react-router'
import { DeezerPage } from './pages/DeezerPage'
import { HomePage } from './pages/HomePage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/deezer" element={<DeezerPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
