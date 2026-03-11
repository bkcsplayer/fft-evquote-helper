import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'fft_lang'

const dictionaries = {
  en: {
    'app.brand': 'FutureFrontier Technology',
    'app.call': 'Call',

    'welcome.kicker': 'Calgary, AB',
    'welcome.title': 'EV Charger Installation\nQuote & Project Tracking',
    'welcome.subtitle': 'Get a fast, standard quote. Track each step from survey → quote → permit → installation.',
    'welcome.cta': 'Get a Free Quote',
    'welcome.note': 'No account needed • Access via secure link',

    'step.progress': 'Step {{n}} of {{total}}',
    'step1.title': 'Basic info',
    'step1.nickname': 'Nickname',
    'step1.nickname_ph': 'e.g. Alex',
    'step1.phone': 'Phone',
    'step1.phone_ph': '+1 (403) 123-4567',
    'step1.err.nickname': 'Please enter a nickname.',
    'step1.err.phone': 'Please enter a Canadian phone number.',
    'common.next': 'Next',

    'step2.title': 'Installation details',
    'step2.charger_brand': 'Charger brand',
    'step2.ev_brand': 'EV brand',
    'step2.ev_brand_ph': 'e.g. Tesla / Ford / Hyundai',
    'step2.email': 'Email',
    'step2.email_ph': 'you@example.com',
    'step2.address': 'Installation address',
    'step2.address_ph': 'Street, City, Province',
    'step2.pickup_date': 'Vehicle pickup date (optional)',
    'step2.preferred_completion': 'Preferred completion date (optional)',
    'step2.referrer': 'Referrer (optional)',
    'step2.referrer_ph': 'Who referred you?',
    'step2.slots': 'Preferred survey time slots',
    'step2.notes': 'Notes (optional)',
    'step2.notes_ph': 'Anything we should know?',
    'step2.submit': 'Submit',
    'step2.submitting': 'Submitting…',
    'step2.err.submit': 'Submission failed. Please try again.',

    'slots.morning': 'Morning (9-12)',
    'slots.afternoon': 'Afternoon (12-3)',
    'slots.evening': 'Evening (3-6)',

    'submitted.title': 'Submitted',
    'submitted.subtitle': 'Thanks! Please choose a preferred Site Survey time using the status link.',
    'submitted.case_ref': 'Case reference',
    'submitted.track': 'Track status',
    'submitted.note': 'Save the link from email/SMS for future access.',

    'status.case': 'Case',
    'status.loading': 'Loading…',
    'status.not_found': 'Not found',
    'status.current': 'Current status',
    'status.progress': 'Progress',
    'status.survey': 'Survey',
    'status.scheduled': 'Scheduled: {{dt}}',
    'status.deposit': 'Deposit: {{state}}',
    'status.deposit.paid': 'Paid',
    'status.deposit.unpaid': 'Not paid',
    'status.confirm_pay': 'Confirm & pay deposit',
    'status.view_quote': 'View quote',
    'status.approve_quote': 'Approve quote',
    'status.timeline': 'Timeline',
    'status.no_timeline': 'No timeline yet.',
    'status.deposit_reported_title': 'E-transfer reported',
    'status.deposit_reported_body': 'We received your e-transfer notice and will verify it shortly.',

    'status.label.pending': 'Submitted',
    'status.label.survey_scheduled': 'Survey scheduled',
    'status.label.survey_completed': 'Survey completed',
    'status.label.quoting': 'Preparing quote',
    'status.label.quoted': 'Quote sent',
    'status.label.customer_approved': 'Quote approved',
    'status.label.permit_applied': 'Permit applied',
    'status.label.permit_approved': 'Permit approved',
    'status.label.installation_scheduled': 'Installation scheduled',
    'status.label.installed': 'Installed',
    'status.label.completed': 'Completed',
    'status.label.cancelled': 'Cancelled',

    'surveyConfirm.title': 'Survey confirmation',
    'surveyConfirm.subtitle': 'A deposit is required to confirm your Site Survey.',
    'surveyConfirm.scheduled': 'Scheduled',
    'surveyConfirm.deposit_status': 'Deposit status: {{state}}',
    'surveyConfirm.deposit_paid': 'Paid',
    'surveyConfirm.deposit_unpaid': 'Not paid',
    'surveyConfirm.pay_paid': 'Deposit already paid',
    'surveyConfirm.note': 'If you proceed with installation, this deposit will be credited toward your final invoice.',
    'surveyConfirm.method': 'Pay by e-transfer',
    'surveyConfirm.to': 'Send e-transfer to',
    'surveyConfirm.recipient': 'Recipient',
    'surveyConfirm.email': 'Email',
    'surveyConfirm.amount': 'Amount',
    'surveyConfirm.message': 'Message',
    'surveyConfirm.message_hint': 'Include your case reference: {{ref}}',
    'surveyConfirm.sender_name': 'Sender name (optional)',
    'surveyConfirm.sender_name_ph': 'Name used for e-transfer',
    'surveyConfirm.sent': 'I sent the e-transfer',
    'surveyConfirm.sent_done': 'Thanks! We will verify and confirm.',
    'surveyConfirm.err.notify': 'Unable to submit. Please contact us.',

    'quoteView.title': 'Quote',
    'quoteView.subtitle': 'Review your quote details below.',
    'quoteView.not_found': 'Quote not found',
    'quoteView.install_type': 'Install type',
    'quoteView.base_price': 'Base price',
    'quoteView.extra_distance': 'Extra distance',
    'quoteView.permit_fee': 'Permit fee',
    'quoteView.survey_credit': 'Survey deposit credit',
    'quoteView.subtotal': 'Subtotal',
    'quoteView.total': 'Total',
    'quoteView.approve': 'Approve quote',
    'quoteView.back_status': 'Back to status',
    'quoteView.approved': 'Approved',
    'quoteView.signed_by': 'Signed by {{name}}',
    'quoteView.signed_at': 'Signed at: {{dt}}',

    'quoteApprove.title': 'Approve quote',
    'quoteApprove.subtitle': 'Please review the key terms and sign to approve.',
    'quoteApprove.done': 'Approved. We’ll contact you with next steps.',
    'quoteApprove.already': 'This quote is already approved.',
    'quoteApprove.back_status': 'Back to status',
    'quoteApprove.back_quote': 'Back to quote',
    'quoteApprove.agree': 'I have read and agree to the terms above.',
    'quoteApprove.signature_name': 'Signature name',
    'quoteApprove.signature_name_ph': 'Your name',
    'quoteApprove.draw': 'Draw your signature',
    'quoteApprove.sig_captured': 'Signature captured',
    'quoteApprove.sig_hint': 'Use mouse or finger',
    'quoteApprove.clear': 'Clear',
    'quoteApprove.submit_busy': 'Submitting…',
    'quoteApprove.submit': 'Confirm approval',
    'quoteApprove.err.agree': 'Please confirm you agree to the terms.',
    'quoteApprove.err.name': 'Please enter your name as signature.',
    'quoteApprove.err.ink': 'Please sign in the signature box.',
    'quoteApprove.err.submit': 'Unable to approve quote.',

    'quoteApprove.term1.title': 'Panel Capacity & Load Calculation',
    'quoteApprove.term1.body':
      'This quote assumes your existing electrical panel has sufficient remaining capacity. If load calculation or on-site work reveals insufficient capacity, additional equipment (e.g. EVEMS / DCC) or a panel upgrade may be required and will be quoted separately.',
    'quoteApprove.term2.title': 'Drywall & Patching Disclaimer',
    'quoteApprove.term2.body':
      'For concealed wiring, access holes may be needed to route cables safely. This quote does not include drywall repair, patching, or repainting.',
    'quoteApprove.term3.title': 'Permit & Pre-existing Violations',
    'quoteApprove.term3.body':
      'Permit fees cover the EV charger circuit approval and inspection. If inspectors identify pre-existing code violations requiring correction, those additional costs are the customer’s responsibility.',
    'quoteApprove.term4.title': 'Equipment & Warranty',
    'quoteApprove.term4.body':
      'We provide a 1-year workmanship warranty on installation only. The EV charger hardware is customer-supplied; hardware or connectivity issues should be handled with the manufacturer.',
  },
  zh: {
    'app.brand': 'FutureFrontier Technology',
    'app.call': '电话',

    'welcome.kicker': '卡尔加里（Calgary, AB）',
    'welcome.title': '充电桩安装\n报价与项目进度查询',
    'welcome.subtitle': '快速获取标准报价，并跟踪：勘查 → 报价 → 许可 → 安装。',
    'welcome.cta': '获取免费报价',
    'welcome.note': '无需注册账号 • 通过安全链接访问',

    'step.progress': '第 {{n}} / {{total}} 步',
    'step1.title': '基础信息',
    'step1.nickname': '称呼',
    'step1.nickname_ph': '例如：Alex',
    'step1.phone': '电话',
    'step1.phone_ph': '+1 (403) 123-4567',
    'step1.err.nickname': '请输入称呼。',
    'step1.err.phone': '请输入加拿大手机号。',
    'common.next': '下一步',

    'step2.title': '安装信息',
    'step2.charger_brand': '充电桩品牌',
    'step2.ev_brand': '车辆品牌',
    'step2.ev_brand_ph': '例如：Tesla / Ford / Hyundai',
    'step2.email': '邮箱',
    'step2.email_ph': 'you@example.com',
    'step2.address': '安装地址',
    'step2.address_ph': '街道，城市，省份',
    'step2.pickup_date': '提车日期（可选）',
    'step2.preferred_completion': '期望完工日期（可选）',
    'step2.referrer': '推荐人（可选）',
    'step2.referrer_ph': '谁推荐了你？',
    'step2.slots': '偏好勘查时间段',
    'step2.notes': '备注（可选）',
    'step2.notes_ph': '有什么需要我们提前了解的吗？',
    'step2.submit': '提交',
    'step2.submitting': '提交中…',
    'step2.err.submit': '提交失败，请稍后再试。',

    'slots.morning': '上午（9-12）',
    'slots.afternoon': '中午（12-3）',
    'slots.evening': '下午（3-6）',

    'submitted.title': '已提交',
    'submitted.subtitle': '感谢提交！请在进度页面选择一个上门勘查时间（我们确认后才会安排上门）。',
    'submitted.case_ref': '案件编号',
    'submitted.track': '查看进度',
    'submitted.note': '请保存邮件/短信中的链接，方便后续访问。',

    'status.case': '案件',
    'status.loading': '加载中…',
    'status.not_found': '未找到',
    'status.current': '当前状态',
    'status.progress': '进度',
    'status.survey': '勘查',
    'status.scheduled': '已安排：{{dt}}',
    'status.deposit': '订金：{{state}}',
    'status.deposit.paid': '已支付',
    'status.deposit.unpaid': '未支付',
    'status.confirm_pay': '确认并支付订金',
    'status.view_quote': '查看报价',
    'status.approve_quote': '确认报价',
    'status.timeline': '进度记录',
    'status.no_timeline': '暂无记录。',
    'status.deposit_reported_title': '已提交转账',
    'status.deposit_reported_body': '我们已收到你的 e-transfer 提交，会尽快核对确认。',

    'status.label.pending': '已提交',
    'status.label.survey_scheduled': '勘查已安排',
    'status.label.survey_completed': '勘查已完成',
    'status.label.quoting': '正在出报价',
    'status.label.quoted': '报价已发送',
    'status.label.customer_approved': '报价已确认',
    'status.label.permit_applied': '许可已申请',
    'status.label.permit_approved': '许可已批准',
    'status.label.installation_scheduled': '安装已安排',
    'status.label.installed': '已安装',
    'status.label.completed': '已完成',
    'status.label.cancelled': '已取消',

    'surveyConfirm.title': '勘查确认',
    'surveyConfirm.subtitle': '确认上门勘查需支付订金。',
    'surveyConfirm.scheduled': '已安排时间',
    'surveyConfirm.deposit_status': '订金状态：{{state}}',
    'surveyConfirm.deposit_paid': '已支付',
    'surveyConfirm.deposit_unpaid': '未支付',
    'surveyConfirm.pay_paid': '订金已支付',
    'surveyConfirm.note': '如继续安装，该订金将抵扣最终账单。',
    'surveyConfirm.method': '通过 e-transfer 支付',
    'surveyConfirm.to': '转账至',
    'surveyConfirm.recipient': '收款人',
    'surveyConfirm.email': '邮箱',
    'surveyConfirm.amount': '金额',
    'surveyConfirm.message': '备注信息',
    'surveyConfirm.message_hint': '请备注案件编号：{{ref}}',
    'surveyConfirm.sender_name': '转账人姓名（可选）',
    'surveyConfirm.sender_name_ph': 'e-transfer 显示的姓名',
    'surveyConfirm.sent': '我已完成转账',
    'surveyConfirm.sent_done': '已收到你的提交，我们会核对并确认。',
    'surveyConfirm.err.notify': '提交失败，请直接联系我们。',

    'quoteView.title': '报价单',
    'quoteView.subtitle': '请查看以下报价明细。',
    'quoteView.not_found': '未找到报价',
    'quoteView.install_type': '安装方式',
    'quoteView.base_price': '基础费用',
    'quoteView.extra_distance': '超出距离',
    'quoteView.permit_fee': '许可费用',
    'quoteView.survey_credit': '勘查订金抵扣',
    'quoteView.subtotal': '小计',
    'quoteView.total': '总计',
    'quoteView.approve': '确认报价',
    'quoteView.back_status': '返回进度',
    'quoteView.approved': '已确认',
    'quoteView.signed_by': '签名：{{name}}',
    'quoteView.signed_at': '签署时间：{{dt}}',

    'quoteApprove.title': '确认报价',
    'quoteApprove.subtitle': '请阅读条款并签名确认。',
    'quoteApprove.done': '已确认。我们会联系你安排下一步。',
    'quoteApprove.already': '该报价已确认，无需重复提交。',
    'quoteApprove.back_status': '返回进度',
    'quoteApprove.back_quote': '返回报价',
    'quoteApprove.agree': '我已阅读并同意以上条款。',
    'quoteApprove.signature_name': '签名姓名',
    'quoteApprove.signature_name_ph': '请输入姓名',
    'quoteApprove.draw': '手写签名',
    'quoteApprove.sig_captured': '已获取签名',
    'quoteApprove.sig_hint': '请用鼠标或手指签名',
    'quoteApprove.clear': '清除',
    'quoteApprove.submit_busy': '提交中…',
    'quoteApprove.submit': '确认提交',
    'quoteApprove.err.agree': '请先勾选同意条款。',
    'quoteApprove.err.name': '请输入姓名作为签名。',
    'quoteApprove.err.ink': '请在签名框手写签名。',
    'quoteApprove.err.submit': '无法确认报价。',

    'quoteApprove.term1.title': '配电箱容量与负载计算',
    'quoteApprove.term1.body':
      '本报价默认现有配电箱剩余容量足够。如负载计算或现场检查发现容量不足，可能需要额外设备（如 EVEMS / DCC）或升级配电箱，相关费用将另行报价。',
    'quoteApprove.term2.title': '暗线走线与墙面修补',
    'quoteApprove.term2.body':
      '如选择暗线走线，为安全走线可能需要开孔。本报价不包含 drywall 修补、补漆等墙面恢复费用。',
    'quoteApprove.term3.title': '许可与既有违规项',
    'quoteApprove.term3.body':
      '许可费用包含充电桩回路的申请与验收。如验收过程中发现既有电气违规项需整改，相关费用由客户承担。',
    'quoteApprove.term4.title': '设备与质保',
    'quoteApprove.term4.body':
      '我们提供 1 年安装工艺质保。充电桩设备由客户自备；设备或联网问题请联系厂家处理。',
  },
}

function interpolate(text, vars) {
  if (!vars) return text
  return String(text).replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k])))
}

function detectDefaultLang() {
  const nav = (navigator.language || '').toLowerCase()
  if (nav.startsWith('zh')) return 'zh'
  return 'en'
}

const I18nContext = createContext({
  lang: 'en',
  setLang: () => {},
  t: (k) => k,
  toggle: () => {},
})

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem(STORAGE_KEY) || detectDefaultLang())

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang)
  }, [lang])

  const api = useMemo(() => {
    function t(key, vars) {
      const dict = dictionaries[lang] || dictionaries.en
      const raw = dict[key] ?? dictionaries.en[key] ?? key
      return interpolate(raw, vars)
    }
    function toggle() {
      setLang((prev) => (prev === 'zh' ? 'en' : 'zh'))
    }
    return { lang, setLang, t, toggle }
  }, [lang])

  return createElement(I18nContext.Provider, { value: api }, children)
}

export function useI18n() {
  return useContext(I18nContext)
}

