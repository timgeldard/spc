import{j as a}from"./process-flow-BOU-rqOV.js";import{c as n}from"./index-jMkSEXcY.js";import{C as i}from"./circle-x-D0y-7wWg.js";import{T as u}from"./triangle-alert-BsP5R0d0.js";/**
 * @license lucide-react v1.7.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const d=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]],b=n("circle-check",d);/**
 * @license lucide-react v1.7.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const x=[["path",{d:"M5 12h14",key:"1ays0h"}]],m=n("minus",x);/**
 * @license lucide-react v1.7.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=[["path",{d:"M12 16h.01",key:"1drbdi"}],["path",{d:"M12 8v4",key:"1got3b"}],["path",{d:"M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z",key:"1fd625"}]],h=n("octagon-alert",f),g={"in-control":{label:"In Control",icon:a.jsx(b,{className:"h-3 w-3","aria-hidden":"true"}),className:"bg-[var(--c-status-ok-bg)] text-[var(--c-status-ok-text)] border-[var(--c-status-ok-border)]"},warning:{label:"Warning",icon:a.jsx(u,{className:"h-3 w-3","aria-hidden":"true"}),className:"bg-[var(--c-status-warn-bg)] text-[var(--c-status-warn-text)] border-[var(--c-status-warn-border)]"},"out-of-control":{label:"Out of Control",icon:a.jsx(i,{className:"h-3 w-3","aria-hidden":"true"}),className:"bg-[var(--c-status-bad-bg)] text-[var(--c-status-bad-text)] border-[var(--c-status-bad-border)]"},"out-of-control-high":{label:"Critical — Out of Control",icon:a.jsx(h,{className:"h-3 w-3","aria-hidden":"true"}),className:"bg-[var(--c-status-bad-bg)] text-[var(--c-status-bad-text)] border-[var(--c-status-bad-strong-border)]"},unknown:{label:"Unknown",icon:a.jsx(m,{className:"h-3 w-3","aria-hidden":"true"}),className:"bg-[var(--c-status-neutral-bg)] text-[var(--c-status-neutral-text)] border-[var(--c-status-neutral-border)]"}};function k({status:t,label:r,compact:e=!1}){const{label:s,icon:c,className:l}=g[t],o=r??s;return a.jsxs("span",{className:`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${l}`,title:o,children:[c,!e&&a.jsx("span",{children:o}),e&&a.jsx("span",{className:"sr-only",children:o})]})}function w(t,r,e=1){if(r==null)return t?"out-of-control":"unknown";const s=r>=e;return t&&!s?"out-of-control-high":t?"out-of-control":s?"in-control":"warning"}function y(t){return t==null?{colorClass:"text-slate-400",verdict:"Unknown"}:t<10?{colorClass:"text-[#143700]",verdict:"Acceptable"}:t<30?{colorClass:"text-[#005776]",verdict:"Conditionally Acceptable"}:{colorClass:"text-[#F24A00]",verdict:"Not Acceptable"}}export{k as S,w as d,y as g};
