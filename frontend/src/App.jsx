import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import QuoteApprove from './pages/QuoteApprove.jsx'
import QuoteView from './pages/QuoteView.jsx'
import StatusPage from './pages/StatusPage.jsx'
import Submitted from './pages/Submitted.jsx'
import SurveyConfirm from './pages/SurveyConfirm.jsx'
import Step1 from './pages/Step1.jsx'
import Step2 from './pages/Step2.jsx'
import Welcome from './pages/Welcome.jsx'
import ServicesHome from './pages/ServicesHome.jsx'
import DiagnosticFlow from './pages/service/DiagnosticFlow.jsx'
import BirdNettingFlow from './pages/service/BirdNettingFlow.jsx'
import CleaningFlow from './pages/service/CleaningFlow.jsx'
import BirdQuoteApprove from './pages/service/BirdQuoteApprove.jsx'
import ServiceStatusPage from './pages/service/ServiceStatusPage.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ServicesHome />} />

        <Route path="/service/diagnostic" element={<DiagnosticFlow />} />
        <Route path="/service/bird-netting" element={<BirdNettingFlow />} />
        <Route path="/service/cleaning" element={<CleaningFlow />} />
        <Route path="/service/status/:token" element={<ServiceStatusPage />} />
        <Route path="/service/bird-netting/quote/:token" element={<BirdQuoteApprove />} />

        <Route path="/quote" element={<Welcome />} />
        <Route path="/quote/step1" element={<Step1 />} />
        <Route path="/quote/step2" element={<Step2 />} />
        <Route path="/quote/submitted" element={<Submitted />} />
        <Route path="/quote/status/:token" element={<StatusPage />} />
        <Route path="/quote/survey-confirm/:token" element={<SurveyConfirm />} />
        <Route path="/quote/view/:token" element={<QuoteView />} />
        <Route path="/quote/approve/:token" element={<QuoteApprove />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
