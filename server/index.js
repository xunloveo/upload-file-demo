import Controller from './controller.js'
import path from 'path'
import http from 'http'
import { fileURLToPath } from 'url'

const server = http.createServer()

const _filename = fileURLToPath(import.meta.url)
const _dirname = path.dirname(_filename)
const UPLOAD_DIR = path.resolve(_dirname, '..', 'uploads') // 大文件存储目录

const ctrl = new Controller(UPLOAD_DIR)

server.on('request', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')

  if (req.method === 'OPTIONS') {
    res.status = 200
    res.end()
    return
  }

  if (req.method === 'POST') {
    if (req.url === '/single') {
      await ctrl.singleUpload(req, res)
      return
    }

    if (req.url === '/upload') {
      await ctrl.handleUpload(req, res)
    }

    if (req.url === '/merge') {
      console.log('m')
      await ctrl.handleMerge(req, res)
      return
    }

    if (req.url === '/verify') {
      await ctrl.handleVerify(req, res)
      return
    }
  }
})

server.listen(3001, () => {
  console.log('connect 3001')
})
