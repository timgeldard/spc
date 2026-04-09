import{c as p}from"./index-DDbf-dUf.js";import{a as o}from"./process-flow-BOU-rqOV.js";/**
 * @license lucide-react v1.7.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const d=[["path",{d:"M5 12h14",key:"1ays0h"}],["path",{d:"m12 5 7 7-7 7",key:"xquz4c"}]],g=p("arrow-right",d);function m(r,n,a){const[i,s]=o.useState(null),[u,l]=o.useState(!1),[f,c]=o.useState(null);return o.useEffect(()=>{if(!r){s(null);return}let e=!1;return l(!0),c(null),fetch("/api/spc/process-flow",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({material_id:r,date_from:n||null,date_to:a||null})}).then(t=>t.ok?t.json():t.json().then(h=>Promise.reject(h.detail??`Error ${t.status}`))).then(t=>{e||s(t)}).catch(t=>{e||c(String(t))}).finally(()=>{e||l(!1)}),()=>{e=!0}},[r,n,a]),{flowData:i,loading:u,error:f}}export{g as A,m as u};
