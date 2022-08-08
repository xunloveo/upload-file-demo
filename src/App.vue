

<template>
  <div style="width: 100%">
    <input type="file" @change="handleChangeFile" />
    <el-button @click="handleUpload" type="primary" :disabled="uploadDisabled">上传</el-button>
     <el-button @click="handleResume" v-if="status === Status.pause"
        >恢复</el-button
      >
      <el-button
        v-else
        :disabled="status !== Status.uploading || !container.hash"
        @click="handlePause"
        >暂停</el-button
      >

    <div style="margin-top: 15px;">
      <div>
        <div>计算文件 hash</div>
        <el-progress :percentage="hashPercentage"></el-progress>
      </div>
      <div>
        <div>总进度</div>
        <el-progress :percentage="fakeUploadPercentage"></el-progress>
      </div>
    </div>

    <el-table :data="data" border>
      <el-table-column
        prop="hash"
        label="chunk hash"
        align="center"
      ></el-table-column>
      <el-table-column label="size(KB)" align="center" width="120">
        <template v-slot="{ row }">
          {{ transformByte(row.size) }}
        </template>
      </el-table-column>
      <el-table-column label="percentage" align="center">
        <template v-slot="{ row }">
          <el-progress
            :percentage="row.percentage"
            color="#909399"
          ></el-progress>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { request, post } from './http'
import { ElMessage } from 'element-plus'

// 切片大小
const SIZE = 10 * 1024 * 1024 

const Status = {
  wait: 'wait',
  pause: 'pause',
  uploading: 'uploading'
}

const container = reactive({
  file: null,
  hash: "",
  worker: null
})

const hashPercentage = ref(0)
// 当暂停时会取消 xhr 导致进度条后退
    // 为了避免这种情况，需要定义一个假的进度条
    // use fake progress to avoid progress backwards when upload is paused
const fakeUploadPercentage = ref(0) 

const data = ref([])
const requestList = ref([])
const status = ref(Status.wait)

const uploadDisabled = computed(() => {
  return (
    !container.file ||
    [Status.pause, Status.uploading].includes(status.value)
  );
})

const uploadPercentage = computed(() => {
  if(!container.file || !data.value.length) return 0
  const loaded = data.value.map(item => item.size * item.percentage).reduce((acc, cur) => acc + cur)
  return parseInt((loaded / container.file.size).toFixed(2))
})

watch(() => uploadPercentage.value, (now) => {
  if(now > fakeUploadPercentage.value) {
    fakeUploadPercentage.value = now
  }
})

const transformByte = (val) => Number((val / 1024).toFixed(0))


// 更换文件
const handleChangeFile = (e) => {
  const [file] = e.target.files
  if(!file) return
  container.file = file
}

// 生成切片
const createFileChunk = (file, size = SIZE) => {
  const fileChunkList = []
  let cur = 0
  while(cur < file.size) {
    fileChunkList.push({ file: file.slice(cur, cur + size)})
    cur += size
  }
  return fileChunkList
}

// 生成文件hash 使用web-worker
const calculateHash = (fileChunkList) => {
  return new Promise(resolve => {
    container.worker = new Worker('/hash.js')
    container.worker.postMessage({fileChunkList})
    container.worker.onmessage = e => {
      const { percentage, hash } = e.data
      hashPercentage.value = percentage
      if(hash) {
        resolve(hash)
      }
    }
  })
}

// 上传切片
const uploadChunks = async (uploadedList = []) => {
  const _requestList = data.value.map(({chunk, hash, index}) => {
    const formData = new FormData()
    formData.append('chunk', chunk)
    formData.append('hash', hash)
    formData.append('filename', container.file.name)
    formData.append('fileHash', container.hash)
    return { formData, index }
  }).map(({formData, index}) => request({
      url: '/upload', 
      data: formData, 
      onProgress: createProgressHandler(data.value[index]), 
      requestList: requestList.value
    })
  )

  // 并发请求
  await Promise.all(_requestList)

  // 之前上传的切片数量 + 本次上传的切片数量 = 所有切片数量时合并切片
  if (uploadedList.length + _requestList.length === data.value.length) {
    await mergeRequest()
  }
}

// 合并请求
const mergeRequest = async () => {
  await post('/merge',{   
    filename: container.file.name,
    size: SIZE,
    fileHash: container.hash
  })
  status.value = Status.wait
}

// 文件秒传
const verifyUpload = async (filename, fileHash) => {
  const data = await post("/verify", { filename, fileHash });
  return data;
}

// 上传文件
const handleUpload = async () => {
  if(!container.file) return
  
  status.value = Status.uploading

  console.log('s', status.value )

  // const formData = new FormData()
  // formData.append('file', container.file)
  // console.log(formData)
  // await request('/single', 'post', formData)

  const fileChunkList = createFileChunk(container.file)

  container.hash = await calculateHash(fileChunkList)

  // 判断文件是否存在,如果不存在，获取已经上传的切片
  const { uploaded, uploadedList } = await verifyUpload(
    container.file.name,
    container.hash
  )

  if(uploaded) {
    status.value = Status.wait
    return ElMessage.success("秒传:上传成功");
  }

  data.value = fileChunkList.map(({file}, index) => ({
    fileHash: container.hash,
    chunk: file,
    hash: container.hash + '-' + index,
    index,
    size: file.size,
    percentage: uploadedList.includes(index) ? 100 : 0
  }))

  
  await uploadChunks(uploadedList)
}

// 暂停
const handlePause = () => {
  status.value = Status.pause
  resetData()
}

// 重置数据
const resetData = () => {
  console.log('r', requestList.value)
  requestList.value.forEach(xhr => xhr?.abort())
  
  requestList.value = []
  if(container.worker) {
    container.worker.onmessage = null
  }
}

// 恢复上传
const handleResume = () => {
  status.value = Status.uploading

  const { uploadedList } = await verifyUpload(
    container.file.name,
    container.hash
  )
  await uploadChunks(uploadedList)
}

// 进度条
const createProgressHandler = (item) => {
  return e => item.percentage = parseInt(String(e.loaded / e.total) * 100)
}
</script>


<style scoped>
.el-table {
  margin-top: 20px;
}
</style>
