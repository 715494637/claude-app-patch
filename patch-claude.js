#!/usr/bin/env node
/**
 * Claude Desktop Patcher — CTF Challenge Solution
 *
 * 解锁功能:
 *   1. Code Tab (yukonSilver) — 绕过平台/VM检查，直接返回 supported
 *   2. 开发者特性 (V0e) — 绕过 isPackaged 检查
 *   3. Operon 功能 — 直接返回 supported
 *   4. Computer Use — 绕过平台检查
 *   5. 默认 sidebarMode 改为 "code"
 *
 * 用法:
 *   node patch-claude.js                  # 自动查找并补丁
 *   node patch-claude.js --dry-run        # 仅预览，不实际修改
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const OUT_DIR = __dirname;

// ─── 查找 Claude 安装目录 ──────────────────────────────────

function findClaudeDir() {
  try {
    const result = execSync(
      'powershell -Command "(Get-AppxPackage -Name \'*Claude*\').InstallLocation"',
      { stdio: "pipe", encoding: "utf-8" }
    ).trim();
    if (result && fs.existsSync(result)) return result;
  } catch {}

  const base = "C:\\Program Files\\WindowsApps";
  try {
    const entries = fs.readdirSync(base);
    const claudeDir = entries
      .filter((e) => e.startsWith("Claude_") && e.includes("_x64_"))
      .sort()
      .pop();
    if (claudeDir) return path.join(base, claudeDir);
  } catch {}
  return null;
}

function findAsarPath() {
  const dir = findClaudeDir();
  return dir ? path.join(dir, "app", "resources", "app.asar") : null;
}

function ensureAsar() {
  try {
    execSync("npx --yes @electron/asar --version", { stdio: "pipe" });
    return true;
  } catch {
    console.error("Need @electron/asar. Run: npm i -g @electron/asar");
    return false;
  }
}

// ─── Patch 定义 ──────────────────────────────────────────────

const patches = [
  // ============================================================
  // Patch 1: Code Tab (yukonSilver) — 绕过所有检查，直接返回 supported
  // 用精确字符串匹配完整函数体（771字符）
  // ============================================================
  {
    file: ".vite/build/index.js",
    name: "Unlock Code Tab (yukonSilver → always supported)",
    patches: [
      {
        find: 'function qOe(){const t=vmn();if(t)return t;if(aee)return aee;const e=mmn();return e.status!=="supported"?MV(e):ic().secureVmFeaturesEnabled===!1?MV({status:"unsupported",reason:ot.formatMessage({defaultMessage:"Ask your IT administrator to enable the secureVmFeaturesEnabled setting in the Claude desktop configuration profile.",id:"kVng8z8Z1z",description:"Hint appended to Cowork disabled-by-enterprise message"}),unsupportedCode:"disabled_by_enterprise"}):Rr("secureVmFeaturesEnabled")===!1?MV({status:"unsupported",reason:ot.formatMessage({defaultMessage:"Enable the secureVmFeaturesEnabled preference to use this feature.",id:"Fm12gxKRxW",description:"Hint appended to Cowork disabled-by-user message"}),unsupportedCode:"disabled_by_user"}):MV({status:"supported"})}',
        replace: 'function qOe(){return MV({status:"supported"})}',
      },
    ],
  },

  // ============================================================
  // Patch 2: 开发者特性门控 — 绕过 isPackaged 检查
  // 原始: function V0e(t){return Se.app.isPackaged?{status:"unavailable"}:t()}
  // 补丁: function V0e(t){return t()}
  // ============================================================
  {
    file: ".vite/build/index.js",
    name: "Unlock dev features (bypass isPackaged check)",
    patches: [
      {
        find: 'function V0e(t){return Se.app.isPackaged?{status:"unavailable"}:t()}',
        replace: "function V0e(t){return t()}",
      },
    ],
  },

  // ============================================================
  // Patch 3: Operon — 直接返回 supported
  // 原始: function Imn(){return{status:"unavailable"}}
  // 补丁: function Imn(){return{status:"supported"}}
  // ============================================================
  {
    file: ".vite/build/index.js",
    name: "Unlock Operon (always supported)",
    patches: [
      {
        find: 'function Imn(){return{status:"unavailable"}}',
        replace: 'function Imn(){return{status:"supported"}}',
      },
    ],
  },

  // ============================================================
  // Patch 4: Computer Use — 绕过平台检查（精确字符串匹配）
  // ============================================================
  {
    file: ".vite/build/index.js",
    name: "Unlock Computer Use (bypass platform check)",
    patches: [
      {
        find: 'function Cmn(){return MX()?{status:"supported"}:{status:"unsupported",reason:"Computer use is not available on this platform",unsupportedCode:"unsupported_platform"}}',
        replace: 'function Cmn(){return{status:"supported"}}',
      },
    ],
  },

  // ============================================================
  // Patch 5: GrowthBook feature flag bypass — Sn() always returns true
  // 原始: function Sn(t){const e=Ag[t];return(e==null?void 0:e.on)??!1}
  // 补丁: function Sn(t){return!0}
  // ============================================================
  {
    file: ".vite/build/index.js",
    name: "Unlock all feature flags (Sn → always true)",
    patches: [
      {
        find: "function Sn(t){const e=Ag[t];return(e==null?void 0:e.on)??!1}",
        replace: "function Sn(t){return!0}",
      },
    ],
  },

  // ============================================================
  // Patch 6: 默认 sidebarMode 改为 "code"
  // ============================================================
  {
    file: ".vite/build/index.js",
    name: 'Default sidebarMode → "code"',
    patches: [
      {
        find: 'sidebarMode:"chat"',
        replace: 'sidebarMode:"code"',
      },
    ],
  },

  // ============================================================
  // Patch 7: 在主进程中用 did-finish-load 注入 JS
  //          1. 清除旧的 react-query 缓存（防止缓存错误状态）
  //          2. 注入 fetch hook（拦截后续 bootstrap 请求）
  //          3. 直接修改 React-Query cache 中的 bootstrap 数据
  //             setQueryData 自动触发 React re-render
  //          不使用 protocol.handle 或 CDP，不影响 CF 验证。
  //          不需要 reload，一次加载即可。
  // ============================================================
  {
    file: ".vite/build/index.js",
    name: "Patch bootstrap via React-Query setQueryData on did-finish-load",
    patches: [
      {
        find: 'qti(o.webContents.session),!F6r(o,ti())',
        replace: `qti(o.webContents.session),(function(_wc){try{_wc.webContents.on("did-finish-load",()=>{const _code='(function(){try{try{localStorage.removeItem("react-query-cache-ls")}catch(e){}try{indexedDB.deleteDatabase("keyval-store")}catch(e){}if(!window.__bsPatchInstalled){window.__bsPatchInstalled=true;var _orig=window.fetch;window.fetch=function(){var a=Array.prototype.slice.call(arguments);var u=typeof a[0]==="string"?a[0]:(a[0]&&a[0].url?a[0].url:"");if(u.indexOf("/api/bootstrap")!==-1&&u.indexOf("/system_prompts")===-1){return _orig.apply(this,a).then(function(r){if(!r.ok)return r;return r.clone().text().then(function(t){try{var d=JSON.parse(t);if(d&&d.account&&d.account.memberships){d.account.memberships.forEach(function(m){m.seat_tier="max";if(m.organization){var c=m.organization.capabilities||[];c=c.filter(function(x){return x!=="claude_pro"});["claude_max","code","cowork","operon","computer_use"].forEach(function(x){if(c.indexOf(x)===-1)c.push(x)});m.organization.capabilities=c;m.organization.billing_type="stripe_subscription"}})}return new Response(JSON.stringify(d),{status:r.status,statusText:r.statusText,headers:{"content-type":"application/json"}})}catch(e){return r}})})}return _orig.apply(this,a)}}function patchRQ(){var root=document.getElementById("root");if(!root)return;var ck=Object.keys(root).find(function(k){return k.startsWith("__reactContainer")});if(!ck)return;var fiber=root[ck];var qc=null;function find(f,d){if(!f||d>50||qc)return;if(f.memoizedProps&&f.memoizedProps.client&&typeof f.memoizedProps.client.invalidateQueries==="function"){qc=f.memoizedProps.client;return}find(f.child,d+1);if(!qc)find(f.sibling,d)}find(fiber,0);if(!qc)return;var cache=qc.getQueryCache();var aq=cache.getAll().find(function(q){return q.queryKey[0]==="current_account"});if(!aq||!aq.state.data)return;var d=JSON.parse(JSON.stringify(aq.state.data));if(d.account&&d.account.memberships){d.account.memberships.forEach(function(m){m.seat_tier="max";if(m.organization){var c=m.organization.capabilities||[];c=c.filter(function(x){return x!=="claude_pro"});["claude_max","code","cowork","operon","computer_use"].forEach(function(x){if(c.indexOf(x)===-1)c.push(x)});m.organization.capabilities=c;m.organization.billing_type="stripe_subscription"}});qc.setQueryData(aq.queryKey,d);return true}}if(!patchRQ()){setTimeout(function(){if(!patchRQ()){setTimeout(function(){patchRQ()},2000)}},1000)}return "ok"}catch(e){return "err:"+e.message}})()';_wc.webContents.executeJavaScript(_code).then(r=>{R.info("[Patch] did-finish-load: "+r)}).catch(e=>R.error("[Patch] executeJS err:",e))});R.info("[Patch] did-finish-load handler registered")}catch(_e){R.error("[Patch] setup failed: "+_e)}})(o),!F6r(o,ti())`,
      },
    ],
  },

  // ============================================================
  // Patch 8: 修改 operon bootstrap ensure 函数
  //          原始: ensure 调用 Gzt() 检查 → Bor.ensureAssembled() → rii(t)
  //          如果 VM 组装或 operon 初始化失败，eIPC handlers 不会注册
  //          补丁: 在 catch 中注册 fallback mock eIPC handlers
  //          同时保留 rii 内部的 mock（如果 rii 成功执行）
  // ============================================================
  {
    file: ".vite/build/index.js",
    name: "Patch operon ensure: register mock eIPC on failure",
    patches: [
      // 修改 rii 内部的 health 等实现（如果 rii 被调用的话）
      {
        find: 'health:QM(e.system.health),models:yr(e.system.models,"system.models"),me:yr(e.system.me,"system.me"),status:QM(e.system.status),updateStatus:QM(e.system.updateStatus),envStatus:QM(e.system.envStatus),sessions:QM(e.system.sessions)',
        replace: 'health:async()=>({status:"ok"}),models:yr(e.system.models,"system.models"),me:async()=>({id:"mock",name:"User",email:"user@localhost"}),status:async()=>({status:"ready"}),updateStatus:QM(e.system.updateStatus),envStatus:async()=>({status:"ready"}),sessions:async()=>({sessions:[]})',
      },
      // 修改 nii 中的 ensure 函数，在失败时注册 fallback mock handlers（所有接口）
      {
        find: 'throw wt.error("[Operon] bootstrap failed: %o",n),n',
        replace: `wt.error("[Operon] bootstrap failed: %o",n);(function(_t){try{const _ipc=Se.ipcMain;const _p="$eipc_message$_1853bcd3-f7ee-4392-b085-ee0c6cfacc4c_$_claude.operon_$_";const _empty=async()=>({});const _emptyArr=async()=>([]);const _h={"OperonSystem_$_health":async()=>({status:"ok"}),"OperonSystem_$_me":async()=>({id:"mock",name:"User",email:"user@localhost"}),"OperonSystem_$_models":async()=>({models:[]}),"OperonSystem_$_envStatus":async()=>({status:"ready"}),"OperonSystem_$_status":async()=>({status:"ready"}),"OperonSystem_$_sessions":async()=>({sessions:[]}),"OperonSystem_$_updateStatus":_empty,"OperonEvents_$_onReady":async()=>0,"OperonProjects_$_dashboard":async()=>({projects:[],recent_frames:[]}),"OperonProjects_$_create":_empty,"OperonProjects_$_list":async()=>([]),"OperonProjects_$_get":_empty,"OperonProjects_$_update":_empty,"OperonProjects_$_remove":_empty,"OperonProjects_$_submitRequest":_empty,"OperonProjects_$_listArtifacts":_emptyArr,"OperonProjects_$_listBenches":_emptyArr,"OperonProjects_$_updateBench":_empty,"OperonProjects_$_processingCounts":async()=>({}),"OperonFrames_$_list":_emptyArr,"OperonFrames_$_getFrame":_empty,"OperonFrames_$_createEmpty":_empty,"OperonFrames_$_submitRequest":_empty,"OperonFrames_$_cancelConversation":_empty,"OperonFrames_$_updateMetadata":_empty,"OperonFrames_$_delete":_empty,"OperonFrames_$_listCompactionArchives":_emptyArr,"OperonFrames_$_getCompactionArchive":_empty,"OperonFrames_$_getStreamingBuffer":_empty,"OperonAgents_$_list":_emptyArr,"OperonAgents_$_getCustomPrompt":_empty,"OperonAgents_$_setCustomPrompt":_empty,"OperonAgents_$_deleteCustomPrompt":_empty,"OperonFolders_$_list":_emptyArr,"OperonFolders_$_create":_empty,"OperonFolders_$_update":_empty,"OperonFolders_$_delete":_empty,"OperonFolders_$_moveArtifact":_empty,"OperonArtifacts_$_listForConversation":_emptyArr,"OperonArtifacts_$_deleteArtifact":_empty,"OperonArtifacts_$_rename":_empty,"OperonNotes_$_list":_emptyArr,"OperonNotes_$_create":_empty,"OperonNotes_$_update":_empty,"OperonNotes_$_remove":_empty,"OperonSecrets_$_list":_emptyArr,"OperonSecrets_$_create":_empty,"OperonSecrets_$_update":_empty,"OperonSecrets_$_remove":_empty,"OperonSkills_$_list":_emptyArr,"OperonSkills_$_listForAgent":_emptyArr,"OperonMcp_$_list":_emptyArr,"OperonMcp_$_listForAgent":_emptyArr,"OperonApiKeys_$_getAnthropicKeyStatus":async()=>({hasKey:false}),"OperonPreferences_$_getVMResources":async()=>({memoryGB:4,cpuCount:2}),"OperonPreferences_$_getUserAllowedDomains":_emptyArr,"OperonPreferences_$_getBuiltinAllowlist":_emptyArr,"OperonPreferences_$_getDiskUsage":async()=>({artifacts:{totalBytes:0,byProject:[]},conda:{totalBytes:0},workspace:{totalBytes:0}}),"OperonPreferences_$_getRunningFrameCount":async()=>({count:0}),"OperonHostAccess_$_listGranted":_emptyArr,"OperonAnalytics_$_track":_empty,"OperonConversations_$_sendMessage":_empty,"OperonConversations_$_approvePlan":_empty,"OperonConversations_$_resolveInputRequests":_empty,"OperonConversations_$_resume":_empty,"OperonConversations_$_fork":_empty,"OperonConversations_$_compact":_empty,"OperonBootstrap_$_getConfig":async()=>({agents:[],manifest:{},prompts:{}})};Object.entries(_h).forEach(([k,fn])=>{const ch=_p+k;try{_ipc.removeHandler(ch)}catch(e){}try{_ipc.handle(ch,async(ev,args)=>fn(args))}catch(e){}});wt.info("[Patch] Operon fallback eIPC mock handlers registered (all interfaces)");sEt.add(_t)}catch(e){wt.error("[Patch] Fallback eIPC registration failed: "+e.message)}})(_t);return`,
      },
      // 修改 ensure 函数参数，让 catch 能访问 webContents (t)
      // 同时在 rii 成功后也注册 fallback handlers 覆盖会失败的原始实现
      {
        find: 'if(sEt.has(t))return;const e=kEe.get(t);if(e)return e;const r=(async()=>{try{if((await Gzt()).status!=="supported")throw new Error("operon: feature not enabled for this account")',
        replace: 'if(sEt.has(t))return;const e=kEe.get(t);if(e)return e;const _t=t;const r=(async()=>{try{if((await Gzt()).status!=="supported")throw new Error("operon: feature not enabled for this account")',
      },
      // 在 rii 成功后注册覆盖 handlers（处理 OperonCloud 等会调用真实后端的接口）
      {
        find: 'Uti(),await Bor.ensureAssembled(),await rii(t),sEt.add(t)',
        replace: `Uti(),await Bor.ensureAssembled(),await rii(t),sEt.add(t);(function(__t){try{const __ipc=Se.ipcMain;const __p="$eipc_message$_1853bcd3-f7ee-4392-b085-ee0c6cfacc4c_$_claude.operon_$_";const __e=async()=>({});const __ea=async()=>([]);const __overrides={"OperonCloud_$_listCredentials":__ea,"OperonCloud_$_getCredential":__e,"OperonCloud_$_deleteCredential":__e,"OperonCloud_$_testConnection":__e,"OperonCloud_$_listBucketsOp":__ea,"OperonCloud_$_listObjects":__ea,"OperonCloud_$_listFolder":__ea,"OperonCloud_$_importArtifact":__e,"OperonCloud_$_exportArtifact":__e,"OperonExportBundle_$_saveSessionBundle":__e,"OperonExportBundle_$_saveScriptBundle":__e,"OperonAttachments_$_upload":__e,"OperonAttachments_$_download":__e,"OperonAttachments_$_getMetadata":__e,"OperonArtifacts_$_updatePriority":__e,"OperonArtifacts_$_getMetadata":__e,"OperonArtifacts_$_listVersions":__ea,"OperonArtifacts_$_copy":__e,"OperonArtifacts_$_createTextVersion":__e,"OperonArtifacts_$_bulkMove":__e,"OperonArtifacts_$_classifyForConversation":__ea,"OperonArtifacts_$_classifyForProject":__ea,"OperonArtifacts_$_resetPriorities":__e,"OperonArtifactDownloads_$_download":__e,"OperonArtifactDownloads_$_downloadVersion":__e,"OperonArtifactDownloads_$_downloadZip":__e,"OperonArtifactDownloads_$_downloadConversationZip":__e,"OperonArtifactDownloads_$_getLineage":__ea,"OperonArtifactDownloads_$_getVersionLineage":__ea,"OperonArtifactDownloads_$_getExecutionLog":__ea,"OperonAnnotations_$_list":__ea,"OperonAnnotations_$_create":__e,"OperonAnnotations_$_remove":__e,"OperonAnnotations_$_suggestEdit":__e,"OperonAnnotations_$_applyEdit":__e,"OperonPreferences_$_setVMResources":__e,"OperonPreferences_$_restartVM":__e,"OperonPreferences_$_setUserAllowedDomains":__e,"OperonPreferences_$_addUserAllowedDomain":__e,"OperonPreferences_$_removeUserAllowedDomain":__e,"OperonPreferences_$_refreshKernels":__e,"OperonPreferences_$_setBuiltinAllowlistDisabled":__e,"OperonPreferences_$_setBuiltinAllowlistDisabledGroups":__e,"OperonPreferences_$_markAllowlistOnboardingSeen":__e,"OperonPreferences_$_importBundle":__e};Object.entries(__overrides).forEach(([k,fn])=>{const ch=__p+k;try{__ipc.removeHandler(ch)}catch(e){}try{__ipc.handle(ch,async(ev,args)=>fn(args))}catch(e){}});wt.info("[Patch] Operon override handlers registered after rii")}catch(e){}})(_t)`,
      },
    ],
  },

  // ============================================================
  // Patch 9: 修改主进程 ou() (getBootstrapData) 函数
  //          - 成功获取数据时注入 capabilities
  //          - fetch 失败时构造 mock bootstrap（使用 cookie 中的 orgId）
  //            确保 doInitialize 能拿到 accountId 和 orgId
  // ============================================================
  {
    file: ".vite/build/index.js",
    name: "Patch ou() bootstrap: inject capabilities + mock on failure",
    patches: [
      {
        find: 'async function ou(){if(SK)return SK;if(Kb)return Kb;const t=h8;return Kb=(async()=>{try{const e=await Se.net.fetch(`${ti()}/api/bootstrap`);if(!e.ok)return t===h8&&(Kb=null),e.status===401||e.status===403?(R.warn(`[getBootstrapData] Bootstrap auth rejected (${e.status}) — session cookie likely expired`),{account:null,_clientAuthFailed:!0}):(R.warn(`[getBootstrapData] Bootstrap returned ${e.status}, treating as transient`),null);const r=await e.json();return t!==h8?(R.info("[getBootstrapData] Bootstrap cache was cleared during fetch, discarding stale result"),r):r.account?SK=r:(R.warn("[getBootstrapData] Bootstrap response has no account — user may not be logged in"),Kb=null,r)}catch(e){return R.error("[getBootstrapData] Bootstrap fetch failed",e),t===h8&&(Kb=null),null}})(),Kb}',
        replace: `async function ou(){if(SK)return SK;if(Kb)return Kb;const t=h8;const _patchCaps=r=>{if(r&&r.account&&r.account.memberships){r.account.memberships.forEach(m=>{m.seat_tier="max";if(m.organization){let c=m.organization.capabilities||[];c=c.filter(x=>x!=="claude_pro");["claude_max","code","cowork","operon","computer_use"].forEach(x=>{if(!c.includes(x))c.push(x)});m.organization.capabilities=c;m.organization.billing_type="stripe_subscription"}})}return r};const _mockBs=async()=>{try{const ck=await Se.session.defaultSession.cookies.get({url:ti(),name:"lastActiveOrg"});const oid=ck&&ck[0]?ck[0].value:"00000000-0000-0000-0000-000000000000";const uid=Or.randomUUID();return{account:{uuid:uid,tagged_id:"user_"+uid,email_address:"user@localhost",full_name:"User",display_name:"User",created_at:"2024-01-01T00:00:00Z",updated_at:"2024-01-01T00:00:00Z",accepted_clickwrap_versions:{},is_verified:true,age_is_verified:true,memberships:[{role:"admin",seat_tier:"max",created_at:"2024-01-01T00:00:00Z",updated_at:"2024-01-01T00:00:00Z",organization:{uuid:oid,id:0,name:"Default",settings:{},parent_organization_uuid:null,capabilities:["chat","claude_max","code","cowork","operon","computer_use"],billing_type:"stripe_subscription",free_credits_status:null,api_disabled_reason:null,api_disabled_until:null,rate_limit_tier:"default_claude_ai",data_retention:null,raven_type:null}}],workspace_memberships:[],invites:[],settings:{}},locale:null,statsig:{user:{userID:uid},values:{},values_hash:"patched"},growthbook:{features:{}},intercom_account_hash:null}}catch(e){R.error("[getBootstrapData] Mock bootstrap failed",e);return null}};return Kb=(async()=>{try{const e=await Se.net.fetch(\`\${ti()}/api/bootstrap\`);if(!e.ok){R.warn("[getBootstrapData] Bootstrap returned "+e.status+", using mock");const mk=await _mockBs();return t===h8&&(Kb=null),mk?(SK=mk):null}const r=await e.json();const p=_patchCaps(r);return t!==h8?(R.info("[getBootstrapData] Bootstrap cache was cleared during fetch, discarding stale result"),p):p.account?SK=p:(R.warn("[getBootstrapData] Bootstrap response has no account, using mock"),Kb=null,await _mockBs())}catch(e){R.error("[getBootstrapData] Bootstrap fetch failed, using mock",e);t===h8&&(Kb=null);return await _mockBs()}})(),Kb}`,
      },
    ],
  },

  // ============================================================
  // Patch 10: 绕过 CDP 认证检查
  //           原始: kV(process.argv)&&!Hg()&&process.exit(1)
  //           如果有 --remote-debugging-port 参数但没有有效 CDP token，
  //           原始代码会直接 process.exit(1)。补丁后允许无认证调试。
  // ============================================================
  {
    file: ".vite/build/index.pre.js",
    name: "Bypass CDP auth check (allow --remote-debugging-port)",
    patches: [
      {
        find: "kV(process.argv)&&!Hg()&&process.exit(1)",
        replace: "/* CDP auth bypassed */",
      },
    ],
  },

  // ============================================================
  // Patch 11: 绕过 OAuth，使用 CLI 的本地认证配置
  //           原始 _fetchBaseQueryConfig 通过 OAuth 获取 token，
  //           服务器端会验证 Pro/Max 订阅。
  //           补丁后跳过 OAuth，直接用 CLI settings.json 中的
  //           env 配置（ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL）
  // ============================================================
  {
    file: ".vite/build/index.js",
    name: "Bypass OAuth in _fetchBaseQueryConfig (use CLI local config)",
    patches: [
      {
        find: 'async _fetchBaseQueryConfig(){const e=GR[yu()],r=u1(Sn("2392971184")?{...e,scope:`${e.scope} user:sessions:claude_code`}:e),[n,i]=await Promise.all([L4(r),r5e()]);if(!n.ok){const{reason:c}=n;throw R.error(`Cannot get base query config: oauth failed (${c.type}): ${c.detail}`),new vie(c)}const s=n.token;return{sessionEnv:{...await qtn({oauthToken:s,apiHost:r.apiHost,shellPath:i}),DISABLE_MICROCOMPACT:"1"}}}',
        replace: 'async _fetchBaseQueryConfig(){const i=await r5e();return{sessionEnv:{...await qtn({oauthToken:"",apiHost:"http://localhost:8317",shellPath:i}),DISABLE_MICROCOMPACT:"1",CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST:"",ANTHROPIC_API_KEY:"sk-op",ANTHROPIC_AUTH_TOKEN:"sk-op",ANTHROPIC_BASE_URL:"http://localhost:8317",ANTHROPIC_MODEL:"air/anthropicAtBedrockClaudeV4p6Opus",ANTHROPIC_REASONING_MODEL:"air/anthropicAtBedrockClaudeV4p6Opus"}}}',
      },
    ],
  },
  // Patch 12: 移除 --model 命令行参数，让 CLI 使用自己的 settings.json 配置
  //           桌面端通过 --model claude-sonnet-4-6 强制指定模型，
  //           但用户的代理不认识这个模型名，需要用 settings.json 里的映射
  {
    file: ".vite/build/index.js",
    name: "Remove --model CLI arg (use CLI own settings.json model config)",
    patches: [
      // SDK SubProcess path: h&&z.push("--model",h)
      {
        find: 'h&&z.push("--model",h)',
        replace: 'void 0',
      },
      // PTY resume path: i.model&&l.push("--model",i.model)
      {
        find: 'i.model&&l.push("--model",i.model)',
        replace: 'void 0',
      },
    ],
  },
  // Patch 13: 禁用遥测和非必要服务，防止 Cloudflare 拦截循环
  //           ic() 返回企业配置，注入 disableNonessentialTelemetry + disableNonessentialServices
  {
    file: ".vite/build/index.js",
    name: "Disable telemetry & non-essential services (prevent CF loop)",
    patches: [
      {
        find: 'function ic(){if(fS!==void 0)return fS;switch(process.platform)',
        replace: 'function ic(){if(fS!==void 0)return fS;fS={disableNonessentialTelemetry:!0,disableNonessentialServices:!0,disableEssentialTelemetry:!0};return fS;switch(process.platform)',
      },
    ],
  },
  // Patch 14: (removed — user manages proxy themselves)

  // ============================================================
  // Patch 15: Mock ClaudeVM IPC handlers — 模拟 VM 下载+启动流程
  //           替换 handleCoworkVMApi 调用，注册 mock handlers
  //           让前端看到完整的 onboarding 进度条
  //           "Setting up Claude's workspace" + progress bar
  // ============================================================
  {
    file: ".vite/build/index.js",
    name: "Mock ClaudeVM IPC handlers (simulate VM download+boot)",
    patches: [
      {
        find: 'const{handleCoworkVMApi:w,cleanupVMBundleIfUnsupported:S}=await Promise.resolve().then(()=>hci);w(e.webContents),S()',
        replace: `const{handleCoworkVMApi:w,cleanupVMBundleIfUnsupported:S}=await Promise.resolve().then(()=>hci);(function(_wc){try{const _ipc=Se.ipcMain;const _p="$eipc_message$_1853bcd3-f7ee-4392-b085-ee0c6cfacc4c_$_claude.web_$_ClaudeVM_$_";let _dlStatus="not_downloaded",_runStatus="offline",_dlProgress=0;const _handlers={"download":async()=>{if(_dlStatus==="ready")return{success:true};_dlStatus="downloading";_dlProgress=0;const _tick=()=>new Promise(r=>setTimeout(r,120));for(let i=0;i<=100;i+=2){_dlProgress=i;try{_wc.send("$eipc_event$_1853bcd3-f7ee-4392-b085-ee0c6cfacc4c_$_claude.web_$_ClaudeVM_$_onDownloadProgress",i)}catch(e){}await _tick()}_dlStatus="ready";try{_wc.send("$eipc_event$_1853bcd3-f7ee-4392-b085-ee0c6cfacc4c_$_claude.web_$_ClaudeVM_$_onDownloadStatusChanged","ready")}catch(e){}return{success:true}},"startVM":async()=>{if(_runStatus==="ready")return{success:true};_runStatus="booting";try{_wc.send("$eipc_event$_1853bcd3-f7ee-4392-b085-ee0c6cfacc4c_$_claude.web_$_ClaudeVM_$_onRunningStatusChanged","booting")}catch(e){}await new Promise(r=>setTimeout(r,3000));_runStatus="ready";try{_wc.send("$eipc_event$_1853bcd3-f7ee-4392-b085-ee0c6cfacc4c_$_claude.web_$_ClaudeVM_$_onRunningStatusChanged","ready")}catch(e){}return{success:true}},"getDownloadStatus":async()=>_dlStatus,"getRunningStatus":async()=>_runStatus,"isHostLoopModeEnabled":async()=>false,"isHostLoopDevOverrideActive":async()=>false,"setForceDisableHostLoop":async()=>{},"setYukonSilverConfig":async()=>{},"getInitialApiReachabilityState":async()=>({status:"reachable"}),"checkVirtualMachinePlatform":async()=>true,"enableVirtualMachinePlatform":async()=>true,"restartAfterVMPInstall":async()=>{},"deleteAndReinstall":async()=>{}};Object.entries(_handlers).forEach(([k,fn])=>{const ch=_p+k;try{_ipc.removeHandler(ch)}catch(e){}try{_ipc.handle(ch,async(ev,...args)=>fn(...args))}catch(e){}});R.info("[Patch] Mock ClaudeVM IPC handlers registered via ipcMain")}catch(_e){R.error("[Patch] Mock ClaudeVM failed: "+_e)}})(e.webContents),S()`,
      },
    ],
  },
];

// ─── Helpers ────────────────────────────────────────────────

function resolveGlob(baseDir, pattern) {
  const dir = path.join(baseDir, path.dirname(pattern));
  const fp = path.basename(pattern);
  if (!fp.includes("*")) return [path.join(baseDir, pattern)];
  const re = new RegExp(
    "^" + fp.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$"
  );
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => re.test(f))
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

function applyPatch(content, patch) {
  const { find, replace } = patch;
  if (find instanceof RegExp) {
    if (find.test(content)) {
      find.lastIndex = 0;
      return { content: content.replace(find, replace), applied: true };
    }
    return { content, applied: false };
  }
  if (content.includes(find)) {
    return { content: content.split(find).join(replace), applied: true };
  }
  return { content, applied: false };
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  console.log("=== Claude Desktop Patcher (CTF) ===\n");

  const asarPath = findAsarPath();
  if (!asarPath || !fs.existsSync(asarPath)) {
    console.error("Cannot find app.asar.");
    process.exit(1);
  }
  const claudeDir = findClaudeDir();
  const claudeExe = claudeDir
    ? path.join(claudeDir, "app", "claude.exe")
    : null;

  console.log("app.asar:", asarPath);
  if (!ensureAsar()) process.exit(1);

  const tmpDir = path.join(
    require("os").tmpdir(),
    `claude-patch-${Date.now()}`
  );
  const extractDir = path.join(tmpDir, "app");

  console.log("Extracting...");
  execSync(
    `npx @electron/asar extract "${asarPath}" "${extractDir}"`,
    { stdio: "inherit" }
  );

  let totalApplied = 0;
  for (const group of patches) {
    console.log(`\n[${group.name}]`);
    const files = resolveGlob(extractDir, group.file);
    if (files.length === 0) {
      console.log("  (no matching files, skipping)");
      continue;
    }
    for (const filePath of files) {
      let content = fs.readFileSync(filePath, "utf-8");
      let modified = false;
      for (const patch of group.patches) {
        const { content: c, applied } = applyPatch(content, patch);
        if (applied) {
          content = c;
          modified = true;
          const s =
            patch.find instanceof RegExp
              ? patch.find.toString().slice(0, 60)
              : patch.find.slice(0, 60);
          console.log(`  ✓ OK: ${s}...`);
          totalApplied++;
        } else {
          const s =
            patch.find instanceof RegExp
              ? patch.find.toString().slice(0, 60)
              : patch.find.slice(0, 60);
          console.log(`  ✗ MISS: ${s}...`);
        }
      }
      if (modified && !DRY_RUN) fs.writeFileSync(filePath, content, "utf-8");
    }
  }

  console.log(`\nPatches applied: ${totalApplied}/${patches.reduce((a, g) => a + g.patches.length, 0)}`);
  if (DRY_RUN) {
    console.log("(dry-run, no files written)");
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return;
  }

  // ── Build portable copy ──
  const portableDir = path.join(OUT_DIR, "claude-portable");
  const portableResources = path.join(portableDir, "resources");
  const portableExe = path.join(portableDir, "claude.exe");
  const appSrcDir = path.join(claudeDir, "app");

  const srcExe = path.join(appSrcDir, "claude.exe");

  // Copy fresh exe from original to ensure clean hash for patching
  console.log("\nPreparing portable dir...");
  if (!fs.existsSync(portableDir)) {
    fs.cpSync(appSrcDir, portableDir, { recursive: true });
  } else {
    // Try to copy exe fresh; if locked, use existing (hash may already be patched)
    try {
      fs.copyFileSync(path.join(appSrcDir, "claude.exe"), portableExe);
    } catch (e) {
      console.log("  (exe locked, will patch in-place)");
    }
    if (!fs.existsSync(portableResources))
      fs.mkdirSync(portableResources, { recursive: true });
  }

  // Pack patched asar
  console.log("Packing patched app.asar...");
  const targetAsar = path.join(portableResources, "app.asar");
  execSync(
    `npx @electron/asar pack "${extractDir}" "${targetAsar}"`,
    { stdio: "inherit" }
  );

  fs.rmSync(tmpDir, { recursive: true, force: true });

  // ── Flip Electron fuses ──
  // Disable ASAR integrity validation and OnlyLoadAppFromAsar
  // so the patched asar is accepted without hash matching.
  console.log("Flipping Electron fuses...");
  execSync(
    `npx --yes @electron/fuses write --app "${portableExe}" OnlyLoadAppFromAsar=off EnableEmbeddedAsarIntegrityValidation=off`,
    { stdio: "inherit" }
  );

  // Create launcher
  const launcherPath = path.join(OUT_DIR, "launch-claude-patched.bat");
  fs.writeFileSync(
    launcherPath,
    `@echo off\r\ntitle Claude (Patched)\r\ncd /d "%~dp0claude-portable"\r\nstart "" "claude.exe" --remote-debugging-port=9333 %*\r\n`
  );

  console.log("\n=== Done! ===");
  console.log(`Portable dir: ${portableDir}`);
  console.log(`Launcher:     ${launcherPath}`);
  console.log(`\nDouble-click launch-claude-patched.bat to start.`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
