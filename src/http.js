/**
 * 封装请求
 * @param {*} url 路径
 * @param {*} method 请求方式
 * @param {*} data 数据
 * @param {*} headers 请求头
 * @param {*} onProgress 进度
 * @param {*} requestList 请求列表
 */
const baseUrl = 'http://localhost:3001'
export const request = ({
  url,
  method = 'post',
  data,
  headers = {},
  onProgress = e => e,
  requestList,
}) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = onProgress
    xhr.open(method, baseUrl + url)
    Object.keys(headers).forEach(key => {
      xhr.setRequestHeader(key, headers[key])
    })
    xhr.send(data)

    xhr.onreadystatechange = e => {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          if (requestList) {
            // 成功后删除列表
            const i = requestList.findIndex(req => req === xhr)
            requestList.splice(i, 1)
          }
          resolve({
            data: e.target.response,
          })
        } else if (xhr.status === 500) {
          reject('出问题了')
        }
      }
    }

    // 暴露当前xhr
    requestList?.push(xhr)
  })
}

export async function post(url, data) {
  let ret = await request({
    url,
    data: JSON.stringify(data),
    headers: {
      'content-type': 'application/json',
    },
  })
  return JSON.parse(ret.data)
}
