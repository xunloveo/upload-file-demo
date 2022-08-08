import formidable from 'formidable'
import path from 'path'
import { fileURLToPath } from 'url'
import fse from 'fs-extra'
import multiparty from 'multiparty'
import { resolvePost, extractExt, mergeFiles, getUploadedList } from './util.js'

const _filename = fileURLToPath(import.meta.url)
const _dirname = path.dirname(_filename)

class Controller {
  constructor(uploadDir) {
    this.UPLOAD_DIR = uploadDir
  }

  async mergeFileChunk(filePath, fileHash, size) {
    const chunkDir = path.resolve(this.UPLOAD_DIR, fileHash)
    let chunkPaths = await fse.readdir(chunkDir)
    // 根据切片下标进行排序
    // 否则直接读取目录的获得的顺序可能会错乱
    chunkPaths.sort((a, b) => a.split('-')[1] - b.split('-')[1])
    chunkPaths = chunkPaths.map(cp => path.resolve(chunkDir, cp)) // 转成文件路径
    await mergeFiles(chunkPaths, filePath, size)

    // 合并后删除保存切片的目录
    // delete chunk directory after merging
    fse.rmdirSync(chunkDir)
  }

  async handleMerge(req, res) {
    const data = await resolvePost(req)
    const { fileHash, filename, size } = data
    const ext = extractExt(filename)
    const filePath = path.resolve(this.UPLOAD_DIR, `${fileHash}${ext}`)

    await this.mergeFileChunk(filePath, fileHash, size)

    res.end(
      JSON.stringify({
        code: 0,
        message: 'file merged success',
      })
    )
  }

  async handleVerify(req, res) {
    const data = await resolvePost(req)
    const { filename, fileHash } = data
    const ext = extractExt(filename)
    const filePath = path.resolve(this.UPLOAD_DIR, `${fileHash}${ext}`)

    // 文件是否存在
    let uploaded = false
    let uploadedList = []
    if (fse.existsSync(filePath)) {
      uploaded = true
    } else {
      // 文件没有完全上传完毕，但是可能存在部分切片上传完毕了
      uploadedList = await getUploadedList(
        path.resolve(this.UPLOAD_DIR, fileHash)
      )
    }
    res.end(
      JSON.stringify({
        uploaded,
        uploadedList, // 过滤诡异的隐藏文件
      })
    )
  }

  async singleUpload(req, res) {
    const form = new formidable.IncomingForm()

    // 保留上传文件的后缀名
    form.keepExtensions = true

    // 设置上传文件的路径
    form.uploadDir = path.join(_dirname, this.UPLOAD_DIR)

    // 解析客户端传过来的对象
    form.parse(req, (err, fields, files) => {
      console.log(fields, files, res)
      res.end('ok')
    })
  }

  async handleUpload(req, res) {
    const multipart = new multiparty.Form()
    multipart.parse(req, async (err, fields, files) => {
      if (err) {
        console.log(err)
        res.status = 500
        res.end('process file chunk failed')
        return
      }

      const [chunk] = files.chunk
      const [hash] = fields.hash
      const [filename] = fields.filename
      const [fileHash] = fields.fileHash

      const filePath = path.resolve(
        this.UPLOAD_DIR,
        `${fileHash}${extractExt(filename)}`
      )

      const chunkDir = path.resolve(this.UPLOAD_DIR, fileHash)

      // 文件存在直接返回
      if (fse.existsSync(filePath)) {
        res.end('file exist')
        return
      }

      if (!fse.existsSync(chunkDir)) {
        await fse.mkdirs(chunkDir)
      }
      await fse.move(chunk.path, `${chunkDir}/${hash}`)
      res.end('received file chunk')
    })
  }
}

// module.exports = Controller
export default Controller
