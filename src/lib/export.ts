
import { toPng } from 'html-to-image'
import jsPDF from 'jspdf'

export async function exportElementAsPng(el: HTMLElement, fileName = 'seating-chart.png') {
  const dataUrl = await toPng(el, { pixelRatio: 2, backgroundColor: '#ffffff' })
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = fileName
  a.click()
}

export async function exportElementAsPdf(el: HTMLElement, fileName = 'seating-chart.pdf') {
  const dataUrl = await toPng(el, { pixelRatio: 2, backgroundColor: '#ffffff' })
  const img = new Image()
  img.src = dataUrl
  await img.decode().catch(() => {})
  const w = img.naturalWidth || el.clientWidth
  const h = img.naturalHeight || el.clientHeight

  // Use landscape if wider than tall
  const orientation = w > h ? 'l' : 'p'
  // jsPDF units are in pt by default (1 pt = 1/72 inch). We'll size to fit page.
  const pdf = new jsPDF({ orientation, unit: 'pt', compress: true })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()

  // Fit image within page while preserving aspect
  const scale = Math.min(pageW / w, pageH / h)
  const drawW = w * scale
  const drawH = h * scale
  const offX = (pageW - drawW) / 2
  const offY = (pageH - drawH) / 2

  pdf.addImage(dataUrl, 'PNG', offX, offY, drawW, drawH, '', 'FAST')
  pdf.save(fileName)
}
