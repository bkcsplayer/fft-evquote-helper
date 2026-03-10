import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import QuoteApprove from './pages/QuoteApprove.jsx'
import QuoteView from './pages/QuoteView.jsx'
import StatusPage from './pages/StatusPage.jsx'
import Submitted from './pages/Submitted.jsx'
import SurveyConfirm from './pages/SurveyConfirm.jsx'
import Step1 from './pages/Step1.jsx'
import Step2 from './pages/Step2.jsx'
import Welcome from './pages/Welcome.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/quote" replace />} />

        <Route path="/quote" element={<Welcome />} />
        <Route path="/quote/step1" element={<Step1 />} />
        <Route path="/quote/step2" element={<Step2 />} />
        <Route path="/quote/submitted" element={<Submitted />} />
        <Route path="/quote/status/:token" element={<StatusPage />} />
        <Route path="/quote/survey-confirm/:token" element={<SurveyConfirm />} />
        <Route path="/quote/view/:token" element={<QuoteView />} />
        <Route path="/quote/approve/:token" element={<QuoteApprove />} />

        <Route path="*" element={<Navigate to="/quote" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
