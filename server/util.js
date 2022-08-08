import fse from 'fs-extra'
export const resolvePost = req =>
  new Promise(resolve => {
    let chunk = ''
    req.on('data', data => {
      console.log('d', data)
      chunk += data
    })
    req.on('end', () => {
      resolve(JSON.parse(chunk))
    })
  })

// 写入文件流
const pipeStream = (filePath, writeStream) =>
  new Promise(resolve => {
    const readStream = fse.createReadStream(filePath)
    readStream.on('end', () => {
      fse.unlinkSync(filePath)
      resolve()
    })
    readStream.pipe(writeStream)
  })

export const extractExt = filename =>
  filename.slice(filename.lastIndexOf('.'), filename.length)

export const mergeFiles = async (files, dest, size) => {
  await Promise.all(
    files.map((file, index) =>
      pipeStream(
        file,
        fse.createWriteStream(dest, {
          start: index * size,
          end: (index + 1) * size,
        })
      )
    )
  )
}

// 获取已经上传的切片
export const getUploadedList = async dirPath => {
  return fse.existsSync(dirPath)
    ? (await fse.readdir(dirPath)).filter(name => name[0] !== '.') // 过滤诡异的隐藏文件
    : []
}
