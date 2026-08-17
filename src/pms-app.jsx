import { supabase } from "./supabase.js";
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  CalendarDays, Users, DoorOpen, Zap, UserCog, LogOut,
  Plus, X, Search, ChevronLeft, ChevronRight, Flame, Wind, Snowflake,
  Sparkles, Check, Trash2, Pencil, ShieldCheck, UsersRound,
  BarChart3, History, LogIn, Printer, Banknote, ArrowRight,
  Settings, Eye, XCircle, MoveRight, Tag as TagIcon, Rows2, Rows3, MessageSquare, Wrench, UserCheck,
  AlertTriangle, RefreshCw, Undo2, Copy, Info, Cpu
} from "lucide-react";

/* ---------------------------------------------------------------
   DESIGN TOKENS
   Neutral stone-gray surface, single muted teal accent, mono face
   for data (times/room codes) — a calm operations tool, not a
   marketing page. No color used unless it carries meaning.
----------------------------------------------------------------*/
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

  :root{
    --bg:#F7F7F5;
    --surface:#FFFFFF;
    --surface-2:#F2F2EF;
    --surface-3:#EBEBE7;
    --border:#E3E3DE;
    --border-soft:#EDEDE9;
    --text:#191917;
    --text-2:#55534F;
    --text-muted:#8B8880;
    --accent:#2B5C8A;
    --accent-strong:#1F4568;
    --accent-soft:#E4EDF5;
    --danger:#A8473C;
    --danger-soft:#F6E9E7;
    --warning:#9A7524;
    --warning-soft:#F4EEDD;
    --success:#2A7B7B;
    --success-soft:#E0F0F0;
    /* Type scale — 8 steps, 1.125 ratio around a 13px base */
    --fs-3xs:9px;  --fs-2xs:10px; --fs-xs:11px;  --fs-sm:12px;
    --fs-base:13px; --fs-md:14px; --fs-lg:16px;  --fs-xl:18px;
    --fs-2xl:21px; --fs-3xl:25px;
    /* Radius scale — 5 steps */
    --r-xs:6px; --r-sm:10px; --r-md:12px; --r-lg:16px; --r-xl:20px; --r-pill:999px;
    /* Motion */
    --ease:cubic-bezier(.2,.8,.2,1);
    --dur:.16s;
    --topbar-h:67px;
    --cal-toolbar-h:58px;
    --radius:var(--r-lg);
    --radius-sm:var(--r-sm);
    --shadow-sm: 0 1px 2px rgba(25,25,23,0.05);
    --shadow: 0 1px 3px rgba(25,25,23,0.06), 0 8px 24px -8px rgba(25,25,23,0.10);
    --shadow-lg: 0 2px 6px rgba(25,25,23,0.07), 0 24px 48px -16px rgba(25,25,23,0.18);
  }
  @media (prefers-color-scheme: dark){
    :root{
      --bg:#14161A;
      --surface:#1B1E24;
      --surface-2:#232730;
      --surface-3:#2C313B;
      --border:#2E333D;
      --border-soft:#262A33;
      --text:#ECEEF2;
      --text-2:#B7BCC7;
      --text-muted:#868D9B;
      --accent:#6FA8DC;
      --accent-strong:#A9CCEC;
      --accent-soft:#22313F;
      --danger:#E8897C;
      --danger-soft:#3A2622;
      --warning:#DCB765;
      --warning-soft:#362E1D;
      --success:#6FC0C0;
      --success-soft:#1E3335;
      --shadow-sm: 0 1px 2px rgba(0,0,0,0.4);
      --shadow: 0 1px 3px rgba(0,0,0,0.45), 0 8px 24px -8px rgba(0,0,0,0.55);
      --shadow-lg: 0 2px 6px rgba(0,0,0,0.5), 0 24px 48px -16px rgba(0,0,0,0.7);
    }
    .topbar{ background:rgba(27,30,36,0.86) !important; }
    .btn-primary{ color:#0F1216; }
    .cal-daycell.today{ color:#0F1216; }
    .avatar-btn.active, .room-chip.on, .tag-chip.on, .guest-chip-av, .big-avatar,
    .rail .mark, .brand-mark, .settings-card:hover .ico{ color:#0F1216; }
    .cal-bar.block-bar{
      background:repeating-linear-gradient(45deg, var(--surface-3), var(--surface-3) 6px, var(--surface-2) 6px, var(--surface-2) 12px);
    }
    .bar-vip{ color:var(--surface); }
    /* The registration sheet stays light — it is a printed document. */
    .arrival-sheet, .fisa{ background:#fff; color:#141412; }
  }

  *{box-sizing:border-box;}
  .pms{
    font-family:'Inter',-apple-system,sans-serif;
    background:var(--bg);
    color:var(--text);
    min-height:100vh;
    -webkit-font-smoothing:antialiased;
    -webkit-tap-highlight-color:transparent;
  }
  @media (prefers-reduced-motion: reduce){
    .pms *, .pms *::before, .pms *::after{
      animation-duration:0.01ms !important; animation-iteration-count:1 !important;
      transition-duration:0.01ms !important; scroll-behavior:auto !important;
    }
    .pms .spin{ animation:spin 1.6s linear infinite !important; }
  }
  .pms .mono{ font-family:'IBM Plex Mono', monospace; letter-spacing:-0.01em; }
  .pms button{ font-family:inherit; cursor:pointer; }
  .pms input, .pms select, .pms textarea{ font-family:inherit; }
  .pms ::selection{ background:var(--accent-soft); }
  .pms *:focus-visible{
    outline:2px solid var(--accent); outline-offset:2px; border-radius:var(--r-xs);
  }
  .pms button:focus-visible, .pms a:focus-visible{
    outline:2px solid var(--accent); outline-offset:3px;
  }
  .pms .settings-card:focus-visible, .pms .today-action:focus-visible,
  .pms .action-item:focus-visible, .pms .guest-result:focus-visible{
    outline:2px solid var(--accent); outline-offset:-2px; background:var(--accent-soft);
  }

  /* ---------- Login ---------- */
  .login-wrap{
    min-height:100vh; display:flex; align-items:center; justify-content:center;
    padding:24px; background:
      radial-gradient(circle at 15% 20%, rgba(43,92,138,0.07), transparent 40%),
      var(--bg);
  }
  .login-card{ width:100%; max-width:400px; }
  .login-brand{ display:flex; align-items:center; gap:10px; margin-bottom:28px; }
  .login-brand .mark{
    width:36px; height:36px; border-radius:var(--r-sm); background:var(--accent);
    display:flex; align-items:center; justify-content:center; color:#fff; flex-shrink:0;
  }
  .login-brand h1{ font-size:var(--fs-xl); font-weight:600; margin:0; letter-spacing:-0.01em; }
  .login-brand p{ margin:0; font-size:var(--fs-base); color:var(--text-muted); }
  .login-user-field{ margin-bottom:18px; }
  .role-tag{
    display:inline-block; font-size:var(--fs-xs); font-weight:600; text-transform:uppercase;
    letter-spacing:.04em; padding:2px 7px; border-radius:var(--r-xs);
  }
  .role-admin{ background:var(--accent-soft); color:var(--accent-strong); }
  .role-receptionist{ background:var(--warning-soft); color:var(--warning); }
  .role-housekeeping{ background:var(--success-soft); color:var(--success); }
  .btn{
    display:inline-flex; align-items:center; justify-content:center; gap:7px;
    padding:11px 18px; border-radius:var(--r-sm); border:1px solid transparent; font-size:var(--fs-md);
    font-weight:600; transition:background .15s, border-color .15s, transform .08s, box-shadow .15s;
  }
  .btn:active{ transform:scale(0.985); }
  .btn-primary{ background:var(--accent); color:#fff; width:100%; box-shadow:var(--shadow-sm); }
  .btn-primary:hover{ background:var(--accent-strong); }
  .btn-primary:disabled{ opacity:.5; cursor:not-allowed; }
  .btn-ghost{ background:var(--surface); border-color:var(--border); color:var(--text); }
  .btn-ghost:hover{ background:var(--surface-2); }
  .btn-danger{ background:transparent; color:var(--danger); border-color:var(--danger-soft); }
  .btn-danger:hover{ background:var(--danger-soft); }
  .error-text{ color:var(--danger); font-size:var(--fs-base); margin-top:8px; }

  /* ---------- App shell ---------- */
  .shell{ display:flex; min-height:100vh; }

  .main{ flex:1; min-width:0; display:flex; flex-direction:column; }
  .topbar{
    display:flex; align-items:center; justify-content:space-between; gap:10px;
    padding:14px 26px calc(14px); border-bottom:1px solid var(--border);
    background:rgba(255,255,255,0.85); backdrop-filter:saturate(180%) blur(12px);
    position:sticky; top:0; z-index:20;
    padding-left:max(26px, env(safe-area-inset-left));
    padding-right:max(26px, env(safe-area-inset-right));
  }
  .topbar h2{ margin:0; font-size:var(--fs-xl); font-weight:650; letter-spacing:-0.02em; }
  .topbar .sub{ font-size:var(--fs-base); color:var(--text-muted); margin-top:2px; }
  .who{ display:flex; align-items:center; gap:10px; }
  .who .name{ font-size:var(--fs-base); font-weight:600; }
  .who .role{ font-size:var(--fs-xs); color:var(--text-muted); }
  .brand-block{
    display:flex; align-items:center; gap:11px; background:none; border:none; padding:6px 8px 6px 6px;
    border-radius:var(--r-md); text-align:left; transition:background .15s; min-width:0;
  }
  .brand-block:hover{ background:var(--surface-2); }
  .brand-mark{
    width:34px; height:34px; border-radius:var(--r-sm); background:var(--accent); color:#fff; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
  }
  .brand-text{ min-width:0; }
  .brand-name{
    display:block; font-size:var(--fs-xl); font-weight:650; letter-spacing:-0.025em; color:var(--text);
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
  .brand-block .sub{ display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .top-btn{
    display:flex; align-items:center; gap:7px; padding:9px 14px; border-radius:var(--r-sm);
    border:1px solid var(--border); background:var(--surface); font-size:var(--fs-base); font-weight:600;
    color:var(--text); transition:all .15s;
  }
  .top-btn:hover{ background:var(--surface-2); }
  .top-btn.active{ background:var(--accent-soft); color:var(--accent-strong); border-color:var(--accent); }
  .today-actions{ display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:20px; }
  @media (max-width:820px){ .today-actions{ grid-template-columns:1fr; } }
  .today-action{
    display:flex; align-items:center; gap:12px; padding:14px 16px; background:var(--surface);
    border:1px solid var(--border); border-radius:var(--radius); box-shadow:var(--shadow-sm);
    text-align:left; transition:box-shadow .15s, border-color .15s;
  }
  .today-action:hover{ box-shadow:var(--shadow); border-color:var(--accent); transform:translateY(-1px); }
  .today-action:active{ transform:translateY(0); }
  .today-action:hover .ta-arrow{ opacity:1; transform:translateX(2px); color:var(--accent); }
  .today-action .ta-body{ min-width:0; }
  .ta-arrow{ margin-left:auto; opacity:.4; flex-shrink:0; transition:opacity .15s, transform .15s, color .15s; }
  .ta-ico{
    width:38px; height:38px; border-radius:var(--r-md); background:var(--accent-soft); color:var(--accent-strong);
    display:flex; align-items:center; justify-content:center; flex-shrink:0;
  }
  .ta-t{ display:block; font-size:var(--fs-md); font-weight:650; }
  .ta-d{ display:block; font-size:var(--fs-sm); color:var(--text-muted); margin-top:2px; }
  .topbar-actions{ display:flex; align-items:center; gap:9px; }
  .gear-btn{ width:38px; height:38px; border-radius:50%; }
  .gear-btn.active{ background:var(--accent-soft); color:var(--accent-strong); border-color:var(--accent); }
  .settings-grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:12px; }
  .settings-card{
    display:flex; align-items:flex-start; gap:13px; text-align:left; padding:18px;
    background:var(--surface); border:1px solid var(--border); border-radius:var(--radius);
    box-shadow:var(--shadow-sm); transition:box-shadow .15s, border-color .15s;
  }
  .settings-card:hover{ box-shadow:var(--shadow); border-color:var(--accent); transform:translateY(-1px); }
  .settings-card:active{ transform:translateY(0); }
  .settings-card:hover .ico{ background:var(--accent); color:#fff; }
  .settings-card .ico{ transition:background .15s, color .15s; }
  .settings-card .ico{
    width:38px; height:38px; border-radius:var(--r-md); background:var(--accent-soft); color:var(--accent-strong);
    display:flex; align-items:center; justify-content:center; flex-shrink:0;
  }
  .settings-card .t{ font-size:var(--fs-md); font-weight:650; margin-bottom:3px; }
  .settings-card .d{ font-size:var(--fs-sm); color:var(--text-muted); line-height:1.45; }
  .avatar-btn{
    width:38px; height:38px; border-radius:50%; border:1px solid var(--border); background:var(--surface-2);
    color:var(--accent-strong); font-size:var(--fs-base); font-weight:700; letter-spacing:.02em;
    display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:background .15s,border-color .15s;
  }
  .avatar-btn:hover{ background:var(--accent-soft); border-color:var(--accent); }
  .avatar-btn.active{ background:var(--accent); color:#fff; border-color:var(--accent); }

  /* ---------- Profile ---------- */
  .profile-head{ display:flex; align-items:center; gap:14px; padding:20px; border-bottom:1px solid var(--border); }
  .profile-head .big-avatar{
    width:56px; height:56px; border-radius:50%; background:var(--accent); color:#fff;
    display:flex; align-items:center; justify-content:center; font-size:var(--fs-xl); font-weight:700; flex-shrink:0;
  }
  .profile-head .pname{ font-size:var(--fs-xl); font-weight:600; }
  .perm-list{ padding:6px 0; }
  .perm-item{ display:flex; align-items:center; gap:10px; padding:10px 20px; font-size:var(--fs-base); }
  .perm-item svg{ flex-shrink:0; color:var(--success); }
  .perm-item.off{ color:var(--text-muted); }
  .perm-item.off svg{ color:var(--border); }
  .icon-btn{
    width:34px; height:34px; border-radius:var(--r-sm); border:1px solid var(--border); background:var(--surface);
    display:flex; align-items:center; justify-content:center; color:var(--text-muted);
    transition:background .15s, color .15s, border-color .15s; flex-shrink:0;
  }
  .icon-btn:hover{ background:var(--surface-2); color:var(--text); border-color:var(--text-muted); }
  .content{ padding:20px 26px calc(40px + env(safe-area-inset-bottom)); flex:1; overflow-x:auto; overscroll-behavior-x:contain; }

  /* ---------- Bottom nav (mobile) ---------- */

  @media (pointer: coarse){
    /* Anything under 16px makes iOS zoom the page on focus. */
    .pms input, .pms select, .pms textarea,
    .field input, .field select, .field textarea,
    .search-box input, .msg-compose textarea{ font-size:var(--fs-lg); }
    .modal{ touch-action:pan-y; }
    .icon-btn{ width:42px; height:42px; }
    .btn{ padding:12px 18px; min-height:44px; }
    .status-btn{ padding:11px 2px; }
    .tag-chip, .room-chip{ padding:10px 14px; }
    .action-item{ padding:15px 8px; }
    .sub-tabs button, .mode-switch button, .week-nav button{ min-height:44px; }
    .top-btn{ min-height:42px; }
    .list-row{ padding:15px 16px; }
  }

  @media (max-width:860px){
    :root{ --topbar-h:60px; --cal-toolbar-h:56px; }
    .content{ padding:16px 14px calc(40px + env(safe-area-inset-bottom)); }
    .topbar{ padding:12px 14px; }
    .top-btn{ padding:9px 12px; font-size:var(--fs-base); }
    .brand-name{ font-size:var(--fs-lg); }
  }

  /* ---------- Automation strip ---------- */
  .auto-strip{
    display:flex; gap:10px; overflow-x:auto; padding-bottom:4px; margin-bottom:20px;
    -webkit-overflow-scrolling:touch; overscroll-behavior-x:contain;
  }
  .auto-pill{
    flex-shrink:0; display:flex; align-items:center; gap:10px; background:var(--surface);
    border:1px solid var(--border); border-radius:var(--r-pill); padding:8px 14px 8px 8px;
  }
  .auto-pill .dot{ width:8px; height:8px; border-radius:50%; flex-shrink:0; }
  .auto-pill .dot.soon{ background:var(--accent); box-shadow:0 0 0 4px var(--accent-soft); }
  .auto-pill .dot.later{ background:var(--text-muted); }
  .auto-pill .dot.done{ background:var(--success); }
  .auto-pill .room{ font-weight:600; font-size:var(--fs-base); }
  .auto-pill .when{ font-size:var(--fs-sm); color:var(--text-muted); }
  .auto-empty{
    font-size:var(--fs-base); color:var(--text-muted); background:var(--surface); border:1px dashed var(--border);
    border-radius:var(--radius); padding:14px 16px; margin-bottom:20px;
  }

  /* ---------- Cards / generic ---------- */
  .panel{ background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); box-shadow:var(--shadow-sm); overflow:hidden; }
  .toolbar{ display:flex; align-items:center; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
  .cal-toolbar{ margin-bottom:10px; flex-wrap:nowrap; gap:8px; }
  .cal-toolbar .week-nav{ min-width:0; }
  .cal-toolbar .btn-primary{ white-space:nowrap; flex-shrink:0; }
  @media (max-width:720px){
    .cal-toolbar .week-nav button span{ display:none; }
    .cal-toolbar .week-nav button.on span{ display:inline; }
    .cal-toolbar .week-nav button{ padding:9px 11px; }
    .cal-toolbar .btn-primary{ padding:11px 13px; }
    .cal-toolbar .btn-primary .lbl-long{ display:none; }
  }
  @media (min-width:721px){
    .cal-toolbar .btn-primary .lbl-short{ display:none; }
  }
  .week-nav{
    display:flex; align-items:center; background:var(--surface); border:1px solid var(--border);
    border-radius:var(--r-sm); overflow:hidden; flex-shrink:0;
  }
  .week-nav button{
    display:flex; align-items:center; gap:5px; padding:9px 12px; border:none; background:transparent;
    font-size:var(--fs-base); font-weight:600; color:var(--text); white-space:nowrap;
  }
  .week-nav > button + button{ border-left:1px solid var(--border); }
  .week-nav button:hover{ background:var(--surface-2); }
  .week-nav button.on{ background:var(--accent-soft); color:var(--accent-strong); }
  .jump-wrap{ position:relative; display:flex; }
  .jump-wrap > button{ border-left:1px solid var(--border); }
  .jump-pop{
    position:absolute; top:calc(100% + 6px); left:50%; transform:translateX(-50%);
    background:var(--surface); border:1px solid var(--border); border-radius:var(--r-sm);
    box-shadow:var(--shadow); padding:12px; z-index:30; width:220px;
  }
  .jump-pop label{ display:block; font-size:var(--fs-sm); font-weight:600; color:var(--text-muted); margin-bottom:6px; }
  .jump-pop input{
    width:100%; padding:9px 10px; border:1px solid var(--border); border-radius:var(--r-sm);
    font-size:var(--fs-md); margin-bottom:8px; font-family:inherit;
  }
  @media (max-width:520px){
    .week-nav button span{ display:none; }
    .week-nav button{ padding:9px 14px; }
    .week-nav button.on span{ display:inline; }
  }
  .search-box{
    display:flex; align-items:center; gap:9px; background:var(--surface); border:1px solid var(--border);
    border-radius:var(--r-sm); padding:10px 13px; flex:1; min-width:180px; max-width:340px;
    transition:border-color .15s, box-shadow .15s;
  }
  .search-box:focus-within{ border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-soft); }
  .search-box input{ border:none; outline:none; background:none; font-size:var(--fs-md); width:100%; }
  .grow{ flex:1; }

  /* ---------- Calendar grid ---------- */
  .cal-scroll{
    overflow:auto; border:1px solid var(--border); border-radius:var(--radius);
    background:var(--surface); box-shadow:var(--shadow-sm);
    max-height:calc(100vh - var(--topbar-h) - 132px);
    max-height:calc(100dvh - var(--topbar-h) - 132px);
    -webkit-overflow-scrolling:touch; overscroll-behavior:none; scrollbar-width:thin;
  }
  .cal-grid{ display:grid; min-width:1060px; }
  .cal-row{ display:grid; grid-template-columns:78px repeat(var(--days), minmax(66px, 1fr)); }
  .cal-row + .cal-row{ border-top:1px solid var(--border-soft); }
  /* Separator band marking where one room type ends and the next starts. */
  .cal-typerow{
    position:sticky; left:0; z-index:7;
    background:var(--surface-2); border-top:2px solid var(--border);
    border-bottom:1px solid var(--border);
  }
  .cal-typerow:first-child{ border-top:none; }
  .cal-typelabel{
    position:sticky; left:0; width:max-content;
    padding:5px 10px; font-size:var(--fs-2xs); font-weight:700;
    text-transform:uppercase; letter-spacing:.08em; color:var(--text-muted);
  }
  .cal-scroll.dense .cal-typelabel{ padding:3px 8px; }
  .cal-head{ position:sticky; top:0; background:var(--surface); z-index:8; }
  .cal-head .cal-daycell{ box-shadow:inset 0 -1px 0 var(--border); }
  .cal-head .cal-roomcell{ z-index:9; box-shadow:inset 0 -1px 0 var(--border); }
  .cal-roomcell{
    padding:8px 6px; border-right:1px solid var(--border); display:flex; flex-direction:column; justify-content:center;
    background:var(--surface); position:sticky; left:0; z-index:6; text-align:center;
  }
  .cal-foot .cal-roomcell{ background:var(--surface-2); z-index:8; }
  .cal-roomcell .rname{ font-weight:600; font-size:var(--fs-md); font-family:'IBM Plex Mono',monospace; }
  .cal-roomcell .rfloor{ font-size:var(--fs-2xs); color:var(--text-muted); margin-top:1px; }
  .room-cap-plus{ color:var(--danger); font-weight:700; }
  .cal-daycell{
    padding:10px 6px; border-right:1px solid var(--border-soft); text-align:center; font-size:var(--fs-xs);
    color:var(--text-muted); font-weight:600; text-transform:capitalize;
  }
  .cal-daycell.today{
    color:#fff; background:var(--accent); font-weight:700;
    box-shadow:inset 0 -3px 0 var(--accent-strong);
  }
  .cal-daycell.weekend{ background:var(--surface-2); }
  .cal-cell{
    border-right:1px solid var(--border-soft); min-height:56px; position:relative; padding:4px;
    transition:background .12s;
  }
  .cal-cell:hover{ background:var(--surface-2); cursor:pointer; }
  .cal-cell.weekend{ background:rgba(0,0,0,0.014); }
  .cal-cell.weekend:hover{ background:var(--surface-2); }
  .cal-bar{
    position:absolute; top:7px; bottom:7px; left:3px; border-radius:var(--r-sm); padding:5px 9px;
    font-size:var(--fs-sm); font-weight:600; display:flex; align-items:center; gap:6px;
    overflow:hidden; white-space:nowrap; z-index:4;
    box-shadow:var(--shadow-sm); transition:transform .1s;
  }
  .cal-bar .bar-name{ overflow:hidden; text-overflow:ellipsis; }
  .cal-bar .bar-nights{
    margin-left:auto; font-size:var(--fs-2xs); font-weight:700; opacity:.7;
    font-family:'IBM Plex Mono',monospace; flex-shrink:0;
  }
  .cal-bar.clip-start{ border-top-left-radius:2px; border-bottom-left-radius:2px; }
  .cal-bar.clip-end{ border-top-right-radius:2px; border-bottom-right-radius:2px; }
  .cal-bar:hover{ transform:translateY(-1px); }
  .cal-bar{ cursor:pointer; }
  .cal-bar.moving{ box-shadow:0 0 0 2px var(--accent); }
  .action-modal{ max-width:420px; }
  .action-head{
    display:flex; align-items:flex-start; justify-content:space-between; gap:12px;
    padding-bottom:14px; border-bottom:1px solid var(--border); margin-bottom:8px;
  }
  .action-guest{ font-size:var(--fs-lg); font-weight:650; letter-spacing:-0.015em; }
  .action-meta{ font-size:var(--fs-sm); color:var(--text-muted); margin-top:3px; }
  .action-list{ display:flex; flex-direction:column; }
  .action-item{
    display:flex; align-items:center; gap:13px; width:100%; padding:13px 6px; border:none;
    background:transparent; text-align:left; border-radius:var(--r-sm); transition:background .12s;
  }
  .action-item:hover:not(:disabled){ background:var(--surface-2); }
  .action-item:disabled{ opacity:.42; cursor:not-allowed; }
  .ai-ico{
    width:38px; height:38px; border-radius:var(--r-md); background:var(--surface-2); color:var(--text-2);
    display:flex; align-items:center; justify-content:center; flex-shrink:0;
  }
  .action-item.danger .ai-ico{ background:var(--danger-soft); color:var(--danger); }
  .action-item.danger .ai-t{ color:var(--danger); }
  .ai-body{ min-width:0; }
  .ai-t{ display:block; font-size:var(--fs-md); font-weight:600; }
  .ai-d{ display:block; font-size:var(--fs-sm); color:var(--text-muted); margin-top:2px; }
  .msg-compose{ background:var(--surface-2); border-radius:var(--r-md); padding:11px; margin:4px 0; }
  .msg-compose textarea{
    width:100%; border:1px solid var(--border); border-radius:var(--r-sm); padding:10px 11px;
    font-size:var(--fs-base); font-family:inherit; margin-bottom:9px; resize:vertical; background:var(--surface);
  }
  .msg-compose textarea:focus{ outline:none; border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-soft); }
  .msg-list{ display:flex; flex-direction:column; gap:6px; margin:2px 0 6px; }
  .msg-item{ background:var(--surface-2); border-radius:var(--r-sm); padding:9px 11px; }
  .msg-text{ font-size:var(--fs-base); line-height:1.45; }
  .msg-meta{ font-size:var(--fs-xs); color:var(--text-muted); margin-top:4px; }
  .action-confirm{
    display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;
    background:var(--danger-soft); border-radius:var(--r-sm); padding:12px; font-size:var(--fs-base); font-weight:600;
    color:var(--danger); margin-top:4px;
  }
  .cal-cell.movable{ cursor:copy; }
  .cal-foot{
    border-top:2px solid var(--border) !important; background:var(--surface-2);
    position:sticky; bottom:0; z-index:7;
  }
  .cal-foot .cal-occ{ box-shadow:inset 0 1px 0 var(--border); }
  .cal-occ{
    border-right:1px solid var(--border-soft); padding:8px 4px; display:flex;
    flex-direction:column; align-items:center; gap:2px; justify-content:center;
  }
  .occ-num{ font-size:var(--fs-base); font-weight:700; line-height:1; }
  .occ-pct{ font-size:var(--fs-xs); color:var(--text-muted); line-height:1; }
  .cal-scroll.dense .cal-cell{ min-height:38px; }
  .cal-scroll.dense .cal-bar{ top:4px; bottom:4px; font-size:var(--fs-xs); padding:3px 7px; }
  .cal-scroll.dense .cal-roomcell{ padding:5px 6px; }
  .cal-scroll.dense .cal-roomcell .rname{ font-size:var(--fs-base); }
  .cal-scroll.dense .rfloor{ display:none; }
  .icon-btn.active{ background:var(--accent-soft); color:var(--accent-strong); border-color:var(--accent); }
  .cal-legend{
    display:flex; flex-wrap:wrap; gap:12px; margin-top:12px;
    font-size:var(--fs-xs); color:var(--text-muted);
  }
  .legend-item{ display:flex; align-items:center; gap:5px; }
  .legend-chip{
    width:18px; height:18px; border-radius:var(--r-xs); display:flex; align-items:center;
    justify-content:center; font-size:var(--fs-3xs); font-weight:700; flex-shrink:0;
  }
  .toast-host{
    position:fixed; left:50%; transform:translateX(-50%); z-index:200;
    bottom:calc(18px + env(safe-area-inset-bottom));
    display:flex; flex-direction:column; gap:8px; width:min(440px, calc(100vw - 28px));
    pointer-events:none;
  }
  .toast{
    display:flex; align-items:center; gap:10px; pointer-events:auto;
    background:var(--text); color:var(--bg); border-radius:var(--r-md);
    padding:12px 12px 12px 15px; box-shadow:var(--shadow-lg);
    font-size:var(--fs-base); font-weight:500;
    animation:toast-in .22s var(--ease);
  }
  @keyframes toast-in{ from{ opacity:0; transform:translateY(10px); } to{ opacity:1; transform:none; } }
  .toast-msg{ flex:1; min-width:0; }
  .toast-ok{ background:var(--success); color:#fff; }
  .toast-danger{ background:var(--danger); color:#fff; }
  .toast-undo{
    display:flex; align-items:center; gap:5px; background:rgba(255,255,255,0.18); color:inherit;
    border:none; border-radius:var(--r-sm); padding:7px 11px; font-size:var(--fs-sm); font-weight:700;
    flex-shrink:0;
  }
  .toast-undo:hover{ background:rgba(255,255,255,0.3); }
  .toast-x{
    background:none; border:none; color:inherit; opacity:.65; display:flex; padding:4px; flex-shrink:0;
  }
  .toast-x:hover{ opacity:1; }
  .move-banner{
    display:flex; align-items:center; gap:10px; background:var(--accent-soft); color:var(--accent-strong);
    border-radius:var(--r-sm); padding:10px 13px; font-size:var(--fs-base); font-weight:600; margin-bottom:10px;
  }
  .move-banner span{ flex:1; }
  .drag-error{
    background:var(--danger-soft); color:var(--danger); border-radius:var(--r-sm); padding:10px 13px;
    font-size:var(--fs-base); font-weight:600; margin-bottom:10px;
  }
  .bar-glyph{
    font-size:var(--fs-2xs); line-height:1; flex-shrink:0; opacity:.85; font-weight:700;
  }
  .st-confirmed{ background:var(--accent-soft); color:var(--accent-strong); border:1px solid rgba(43,92,138,.35); }
  .st-checkedin{ background:var(--success-soft); color:var(--success); border:1px solid rgba(42,123,123,.35); }
  .st-checkedout{ background:var(--surface-2); color:var(--text-muted); border:1px solid var(--border); }
  .st-cancelled{ background:var(--danger-soft); color:var(--danger); border:1px solid var(--danger); text-decoration:line-through; }

  /* ---------- Lists ---------- */
  .list-row{
    display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 18px;
    border-bottom:1px solid var(--border-soft); transition:background .12s;
  }
  .list-row:hover{ background:var(--surface-2); }
  .list-row:last-child{ border-bottom:none; }
  /* Blocul de continut trebuie sa ocupe latimea ramasa, altfel se
     strange la latimea textului si space-between il aseaza diferit pe
     fiecare rand — ceea ce face lista sa para centrata si dezordonata.
     min-width:0 permite trunchierea in loc de intindere. */
  .list-row > *:first-child{ flex:1 1 auto; min-width:0; text-align:left; }
  .list-row .primary{ font-weight:600; font-size:var(--fs-md); text-align:left; }
  .list-row .secondary{
    font-size:var(--fs-sm); color:var(--text-muted); margin-top:2px; text-align:left;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  }
  .row-actions{ display:flex; gap:6px; flex:0 0 auto; }

  /* ---------- Room / task cards ---------- */
  .room-grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:12px; }
  .group-head{
    display:flex; align-items:center; gap:8px; font-size:var(--fs-sm); font-weight:700; text-transform:uppercase;
    letter-spacing:.05em; color:var(--text-muted); margin-bottom:10px;
  }
  .room-card{
    background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:14px;
    box-shadow:var(--shadow-sm); transition:box-shadow .15s, border-color .15s;
  }
  .room-card:hover{ box-shadow:var(--shadow); border-color:var(--text-muted); }
  .room-card .top{ display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
  .room-card h4{ margin:0; font-size:var(--fs-lg); }
  .arrival-badge{
    font-size:var(--fs-xs); font-weight:700; text-transform:uppercase; letter-spacing:.03em;
    background:var(--warning-soft); color:var(--warning); padding:3px 7px; border-radius:var(--r-xs);
  }
  .status-btns{ display:flex; gap:4px; margin-top:12px; }
  .status-btn{
    flex:1 1 0; min-width:0; padding:9px 2px; border-radius:var(--r-sm);
    border:1px solid var(--border); background:var(--surface);
    font-size:var(--fs-2xs); font-weight:600; color:var(--text-muted); text-align:center;
    letter-spacing:-0.01em; white-space:nowrap; overflow:hidden; text-overflow:clip;
    transition:all .15s;
  }
  .status-btn:hover{ border-color:var(--text-muted); color:var(--text); }
  .status-btn.on{ border-color:transparent; }
  .status-btn.on.clean{ background:var(--success-soft); color:var(--success); }
  .status-btn.on.dirty{ background:var(--danger-soft); color:var(--danger); }
  .status-btn.on.progress{ background:var(--warning-soft); color:var(--warning); }
  .device-row{ display:flex; align-items:center; gap:6px; font-size:var(--fs-sm); color:var(--text-muted); margin-top:4px; }

  /* ---------- Modal ---------- */
  .modal-overlay{
    position:fixed; top:0; left:0; right:0; height:100vh; height:100dvh; height:var(--vvh, 100dvh);
    top:var(--vvt, 0px);
    background:rgba(20,19,17,0.38); display:flex; align-items:flex-end;
    justify-content:center; z-index:100; backdrop-filter:blur(1px);
    overscroll-behavior:contain; touch-action:manipulation;
    padding-left:env(safe-area-inset-left); padding-right:env(safe-area-inset-right);
    padding-top:max(24px, env(safe-area-inset-top));
    box-sizing:border-box;
  }
  .modal{
    background:var(--surface); width:100%; max-width:500px; border-radius:var(--r-xl) 20px 0 0;
    /* scadem un spatiu fix, nu doar un procent — garanteaza un gol vizibil
       sus indiferent cat de mare/mica iese metrica de inaltime folosita */
    max-height:calc(100vh - 48px); max-height:calc(100dvh - 48px);
    max-height:calc(var(--vvh, 100dvh) - 48px);
    overflow-y:auto; overscroll-behavior:contain;
    -webkit-overflow-scrolling:touch;
    padding:22px 22px calc(22px + env(safe-area-inset-bottom));
    animation:slideup .2s cubic-bezier(.2,.8,.2,1); box-shadow:var(--shadow-lg);
  }
  .modal-head{
    position:sticky; top:-22px; background:var(--surface); z-index:3;
    padding:12px 0 12px; margin:-4px 0 12px;
  }
  @media (min-width:600px){
    .modal-overlay{ align-items:center; }
    .modal{ border-radius:var(--r-xl); margin-bottom:0; }
  }
  @keyframes slideup{ from{ transform:translateY(16px); opacity:0; } to{ transform:translateY(0); opacity:1; } }
  @keyframes spin{ from{ transform:rotate(0deg); } to{ transform:rotate(360deg); } }
  .pms .spin{ animation:spin 1s linear infinite; color:var(--accent); }
  .skeleton-shell{ min-height:100vh; background:var(--bg); }
  .skeleton-body{ padding:20px 26px; display:flex; flex-direction:column; gap:14px; }
  .sk{
    background:linear-gradient(90deg, var(--surface-2) 25%, var(--surface-3) 37%, var(--surface-2) 63%);
    background-size:400% 100%; animation:sk-shine 1.4s ease-in-out infinite;
    border-radius:var(--r-md);
  }
  @keyframes sk-shine{ from{ background-position:100% 50%; } to{ background-position:0 50%; } }
  .sk-topbar{ height:var(--topbar-h); border-radius:0; }
  .sk-row{ display:flex; gap:12px; flex-wrap:wrap; }
  .sk-stat{ height:84px; flex:1; min-width:130px; }
  .sk-block{ height:52px; }
  .sk-panel{ height:230px; flex:1; min-width:260px; }
  @media (max-width:860px){ .skeleton-body{ padding:16px 14px; } }
  .boot{
    display:flex; flex-direction:column; align-items:center; gap:12px; text-align:center;
    color:var(--text-muted); font-size:var(--fs-md);
  }
  .boot-error{
    background:var(--surface); border:1px solid var(--border); border-radius:var(--radius);
    padding:26px 22px; box-shadow:var(--shadow); color:var(--danger); max-width:360px;
  }
  .boot-error strong{ display:block; color:var(--text); font-size:var(--fs-lg); margin-bottom:5px; }
  .boot-error p{ margin:0; color:var(--text-muted); font-size:var(--fs-base); line-height:1.5; word-break:break-word; }
  .modal-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
  .modal-head h3{ margin:0; font-size:var(--fs-xl); font-weight:650; letter-spacing:-0.015em; }
  .field{ margin-bottom:14px; }
  .field{ display:block; }
  .field .fl, .field > label{
    display:block; font-size:var(--fs-sm); font-weight:600; color:var(--text-muted); margin-bottom:6px;
  }
  label.field{ cursor:pointer; }
  label.field input, label.field select, label.field textarea{ cursor:auto; }
  .field input, .field select, .field textarea{
    width:100%; max-width:100%; min-width:0; padding:11px 13px; border:1px solid var(--border);
    border-radius:var(--r-sm); font-size:var(--fs-md); background:var(--surface); color:var(--text);
    transition:border-color .15s, box-shadow .15s;
  }
  /* iOS ignora border/border-radius/padding pe datetime-local/date/time si
     foloseste propriul aspect nativ, care poate depasi latimea cutiei —
     -webkit-appearance:none il obliga sa respecte stilul definit mai sus. */
  .field input[type="datetime-local"], .field input[type="date"], .field input[type="time"]{
    -webkit-appearance:none; appearance:none;
  }
  .field input:focus, .field select:focus, .field textarea:focus{
    outline:none; border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-soft);
  }
  .field input.input-error, .field select.input-error, .field textarea.input-error{
    border-color:var(--danger);
  }
  .field .fl{ letter-spacing:0.01em; }
  .field-row{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .modal-actions{ display:flex; gap:8px; margin-top:18px; }
  .subform{ background:var(--surface-2); border-radius:var(--r-md); padding:14px 14px 2px; margin-bottom:14px; }
  .link-btn{
    background:none; border:none; color:var(--accent); font-size:var(--fs-sm); font-weight:600;
    text-transform:none; letter-spacing:0; padding:0; text-decoration:underline;
  }
  .guest-search{ display:flex; flex-direction:column; gap:8px; }
  .bar-chart{ display:flex; align-items:flex-end; gap:3px; height:130px; }
  .bar-col{ flex:1; height:100%; display:flex; flex-direction:column; justify-content:flex-end; align-items:center; position:relative; }
  .bar-fill{ width:100%; background:var(--accent); border-radius:var(--r-xs) 3px 0 0; min-height:2px; opacity:.85; transition:opacity .12s; }
  .bar-col:hover .bar-fill{ opacity:1; }
  .bar-label{ position:absolute; bottom:-17px; font-size:var(--fs-2xs); color:var(--text-muted); font-family:'IBM Plex Mono',monospace; }
  .bar-chart{ margin-bottom:20px; }
  .meter{ flex:1; height:7px; background:var(--surface-3); border-radius:var(--r-pill); overflow:hidden; min-width:70px; }
  .meter-fill{ height:100%; background:var(--accent); border-radius:var(--r-pill); }
  .season-grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:10px; }
  /* ---------- Arrival sheet ---------- */
  .arrival-modal{ max-width:700px; }
  .fisa{ border:1px solid #d0d0cc; font-family:'Inter',sans-serif; color:#2b2b28; background:#fff; }
  .fisa-top{ display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid #d0d0cc; }
  .fisa-logo{ font-size:19px; font-weight:700; letter-spacing:.14em; color:#b08d3f; font-family:Georgia,serif; }
  .fisa-room{ text-align:right; font-size:11.5px; color:#333; line-height:1.5; }
  .fisa-title{ text-align:center; font-size:17px; font-weight:500; padding:10px 8px 2px; }
  .fisa-sub{ text-align:center; font-size:11px; color:#777; padding-bottom:9px; border-bottom:1px solid #d0d0cc; }
  .fisa-grid{ display:flex; flex-direction:column; }
  .frow{ display:grid; grid-template-columns:1fr; border-bottom:1px solid #e0e0dc; }
  .frow.c2{ grid-template-columns:1fr 1fr; }
  .frow.c3{ grid-template-columns:1fr 1fr 1fr; }
  .fc{ display:flex; flex-direction:column; padding:6px 10px 7px; min-height:46px; min-width:0; }
  .fc + .fc{ border-left:1px solid #e0e0dc; }
  .fc-lab{ display:flex; flex-direction:column; }
  .fc-lab .ro{ font-size:11px; color:#333; line-height:1.3; }
  .fc-lab .en{ font-size:11px; color:#999; line-height:1.3; }
  .fc-val{
    font-size:13px; font-weight:600; color:#111; margin-top:5px; min-height:17px;
    word-break:normal; overflow-wrap:break-word; hyphens:none;
  }
  .fisa-space{ height:120px; border-bottom:1px solid #d0d0cc; }
  .fisa-foot{
    display:flex; align-items:center; justify-content:space-between; padding:9px 16px;
    font-size:11px; color:#555;
  }
  .fisa-foot strong{ color:#111; }
  .fisa-sep{ height:14px; }
  .sheet-sign{ display:flex; justify-content:space-between; gap:24px; }
  .sheet-sign > div{
    flex:1; border-top:1px solid #333; padding-top:7px; text-align:center;
    font-size:11px; color:#444;
  }

  /* ---------- Rooming list (printed document, fixed px) ---------- */
  .rooming-sheet .fisa-top{ align-items:flex-start; padding:14px 18px; }
  .rs-sub{ font-size:10.5px; color:#777; margin-top:3px; letter-spacing:.02em; }
  .rs-meta{ text-align:right; }
  .rs-meta-label{
    font-size:9.5px; text-transform:uppercase; letter-spacing:.12em; color:#8a8a86; font-weight:700;
  }
  .rs-meta-value{ font-size:15px; font-weight:700; color:#141412; margin-top:2px; }
  .rs-meta-date{ font-size:10px; color:#8a8a86; margin-top:2px; }

  .rs-summary{
    display:flex; flex-direction:column;
    border-top:1px solid #d0d0cc; border-bottom:2px solid #141412;
  }
  .rs-line{ display:flex; }
  .rs-line + .rs-line{ border-top:1px solid #e6e6e2; }
  .rs-cell{
    flex:1 1 0; min-width:0; padding:9px 10px; border-right:1px solid #e6e6e2;
  }
  .rs-cell:last-child{ border-right:none; }
  .rs-cell.rs-grow{ flex-grow:2; }
  .rs-k{
    display:block; font-size:9px; text-transform:uppercase; letter-spacing:.08em;
    color:#8a8a86; font-weight:700;
  }
  .rs-v{ display:block; font-size:12.5px; font-weight:600; color:#141412; margin-top:3px; overflow-wrap:break-word; }
  .rs-d1{ display:block; font-weight:600; color:#141412; }
  .rs-d2{ display:block; color:#8a8a86; }
  .rs-d2::before{ content:"→ "; }
  .rs-brk{ display:block; font-size:9px; font-weight:600; color:#8a8a86; }

  .rooming-wrap{ overflow-x:auto; -webkit-overflow-scrolling:touch; }
  .rooming{ width:100%; border-collapse:collapse; table-layout:fixed; min-width:520px; }
  .rooming thead th{
    font-size:8.5px; text-transform:uppercase; letter-spacing:.06em; color:#5a5a56;
    font-weight:700; text-align:left; padding:8px 8px; border-bottom:1px solid #141412;
  }
  .rooming tbody td{
    padding:9px 8px; font-size:12.5px; border-bottom:1px solid #e6e6e2; vertical-align:middle;
    overflow-wrap:break-word; word-break:normal; hyphens:none;
  }
  .rooming tbody tr:nth-child(even) td{ background:#faf9f7; }
  .rooming .c-num{ width:24px; text-align:center; color:#9a9a95; font-size:10.5px; }
  .rooming .c-room{ width:78px; }
  .rs-room-no{ font-weight:700; font-size:13px; letter-spacing:.02em; display:block; }
  .rs-room-type{ display:block; font-size:9.5px; color:#8a8a86; text-transform:uppercase; letter-spacing:.05em; }
  .rooming .c-occ{ font-weight:500; width:auto; line-height:1.35; white-space:normal; }
  .rooming thead th.c-occ{ font-weight:700; white-space:nowrap; }
  .rooming .c-d{ width:82px; white-space:nowrap; font-size:11px; color:#4a4a46; }
  .rooming .c-n{ width:42px; text-align:center; color:#4a4a46; }
  .rooming .c-tot{ font-weight:700; color:#141412; }
  .rooming .c-sign{ width:108px; border-left:1px solid #e6e6e2; }
  .rooming tbody .c-sign{ height:34px; }
  .rooming tfoot td{
    padding:9px 10px; font-size:12px; font-weight:700; border-top:2px solid #141412;
  }
  .rooming tfoot .c-occ{ color:#5a5a56; font-weight:600; }

  .rs-value{ padding:10px 12px 0; text-align:right; font-size:12px; color:#5a5a56; }
  .rs-value strong{ font-size:14px; color:#141412; }
  .rs-notes{ padding:16px 12px 0; }
  .rs-notes-title{
    font-size:9px; text-transform:uppercase; letter-spacing:.08em; color:#8a8a86; font-weight:700;
  }
  .rs-notes-lines{ display:flex; flex-direction:column; gap:14px; margin-top:12px; }
  .rs-notes-lines span{ display:block; border-bottom:1px solid #d8d8d4; height:1px; }
  .rooming-sheet .sheet-sign{ margin:30px 12px 14px; }

  /* Narrow screens: shrink every column to fixed px widths that sum
     within the viewport, instead of relying on side-scroll — this must
     come AFTER the base .rooming rules above so the override actually
     wins on mobile (same selector specificity, later wins). */
  @media (max-width:640px){
    .rs-cell{ padding:7px 6px; }
    .rs-k{ font-size:8px; }
    .rs-v{ font-size:11px; }
    .rooming-wrap{ overflow-x:visible; }
    .rooming{ min-width:0; }
    .rooming thead th, .rooming tbody td{ padding:6px 4px; font-size:10.5px; }
    .rooming .c-num{ width:16px; font-size:9px; }
    .rooming .c-room{ width:50px; }
    .rs-room-no{ font-size:11px; }
    .rs-room-type{ font-size:7.5px; }
    .rooming .c-occ{ width:92px; }
    .rooming .c-d{ width:56px; font-size:9.5px; }
    .rs-d1, .rs-d2{ font-size:9.5px; }
    .rooming .c-n{ width:26px; font-size:10.5px; }
    .rooming .c-sign{ display:none; }
  }

  @media print{
    body{ background:#fff; }
    .pms .topbar, .pms .content > *:not(.arrival-overlay){ display:none !important; }
    .pms .no-print{ display:none !important; }
    .arrival-overlay{
      position:static !important; background:none !important; backdrop-filter:none !important;
      display:block !important; padding:0 !important;
    }
    .arrival-modal{
      max-width:none !important; max-height:none !important; box-shadow:none !important;
      border-radius:0 !important; padding:0 !important; overflow:visible !important; animation:none !important;
    }
    .fisa{ break-inside:avoid; page-break-inside:avoid; box-shadow:none !important; }
    .rooming-wrap{ overflow:visible !important; }
    .rooming{ min-width:0 !important; }
    .rs-line{ flex-wrap:nowrap !important; }
    .rs-cell{ border-bottom:none !important; }
    .rooming .c-sign{ display:table-cell !important; }
    .rooming tbody tr{ break-inside:avoid; page-break-inside:avoid; }
    .fisa-sep{ height:8mm; }
    .modal-head{ position:static !important; }
    .arrival-sheet{ display:block !important; }
    * { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    @page{ margin:10mm; }
  }

  .quick-actions{ display:flex; flex-wrap:wrap; gap:8px; margin-top:4px; }
  .quick-actions .btn{ font-size:12.5px; padding:9px 13px; }
  .quick-hint{
    display:inline-flex; align-items:center; font-size:12px; color:var(--text-muted);
    background:var(--surface-2); border-radius:var(--r-sm); padding:9px 12px; line-height:1.3;
  }
  .price-box{
    display:flex; align-items:center; gap:12px; flex-wrap:nowrap;
    background:var(--accent-soft); border-radius:12px; padding:12px 14px; margin-bottom:14px;
  }
  .pb-info{ min-width:0; flex:1; }
  .price-label{ font-size:11px; font-weight:600; color:var(--accent-strong); opacity:.75; white-space:nowrap; }
  .price-value{
    font-size:19px; font-weight:650; color:var(--accent-strong); letter-spacing:-0.02em;
    margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
  .pb-manual{ display:flex; flex-direction:column; flex-shrink:0; width:112px; }
  .pb-manual label{
    font-size:10.5px; font-weight:600; color:var(--accent-strong); opacity:.75;
    margin-bottom:3px; white-space:nowrap;
  }
  .pb-manual input{
    width:100%; padding:8px 10px; border:1px solid rgba(43,92,138,.28); border-radius:9px;
    font-size:14px; background:var(--surface); color:var(--text); text-align:right;
    font-family:'IBM Plex Mono',monospace;
  }
  .pb-manual input:focus{ outline:none; border-color:var(--accent); box-shadow:0 0 0 3px rgba(43,92,138,.15); }
  .stat-row{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px; }
  .stat{
    background:var(--surface); border:1px solid var(--border); border-radius:var(--radius);
    padding:15px 16px; box-shadow:var(--shadow-sm); min-width:0;
  }
  .stat:first-child .stat-value{ color:var(--accent-strong); }
  .stat-label{ font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted); }
  .stat-value{
    font-size:clamp(15px, 3.4vw, 24px); font-weight:650; letter-spacing:-0.03em; margin:5px 0 2px;
    white-space:normal; overflow-wrap:anywhere; line-height:1.15;
  }
  .stat-sub{ font-size:11.5px; color:var(--text-muted); }
  @media (max-width:720px){
    .stat-row{ gap:7px; }
    .stat{ padding:11px 10px; border-radius:11px; }
    .stat-label{ font-size:9.5px; letter-spacing:.03em; }
    .stat-value{ font-size:clamp(13px, 4vw, 17px); margin:3px 0 1px; }
    .stat-sub{ display:none; }
  }
  .phone-input-row{ display:flex; gap:6px; }
  .phone-input-row input{ flex:1; min-width:0; }
  .phone-dial-wrap{ position:relative; flex-shrink:0; }
  .phone-dial-btn{
    height:100%; padding:0 12px; border:1px solid var(--border); border-radius:var(--r-sm);
    background:var(--surface); color:var(--text); font-size:var(--fs-base); font-weight:600;
    min-width:64px;
  }
  .phone-dial-btn:hover{ background:var(--surface-2); }
  .phone-dial-pop{
    position:absolute; top:calc(100% + 6px); left:0; z-index:30; width:240px;
    background:var(--surface); border:1px solid var(--border); border-radius:var(--r-sm);
    box-shadow:var(--shadow); padding:8px;
  }
  .phone-dial-pop input{
    width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:var(--r-sm);
    font-size:var(--fs-base); font-family:inherit; margin-bottom:6px;
  }
  .phone-dial-list{ max-height:240px; overflow-y:auto; display:flex; flex-direction:column; }
  .phone-dial-item{
    display:flex; align-items:center; justify-content:space-between; gap:10px;
    padding:8px 8px; border-radius:var(--r-xs); font-size:var(--fs-base); text-align:left;
    background:none; border:none; color:var(--text);
  }
  .phone-dial-item:hover{ background:var(--surface-2); }
  .phone-dial-item.on{ background:var(--accent-soft); color:var(--accent-strong); font-weight:600; }
  .phone-dial-empty{ padding:10px 8px; font-size:var(--fs-sm); color:var(--text-muted); }
  .guest-contact-info{
    display:flex; flex-direction:column; gap:3px; font-size:var(--fs-base); color:var(--text-2);
    margin-bottom:16px;
  }
  .guest-contact-info a{ color:var(--accent-strong); text-decoration:none; }
  .guest-contact-info a:hover{ text-decoration:underline; }
  .pager{ display:flex; align-items:center; justify-content:center; gap:14px; margin-top:14px; }
  .pager-info{ font-size:var(--fs-sm); color:var(--text-muted); white-space:nowrap; }
  .today-cols{ display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:14px; align-items:start; }
  .section-panel{ overflow:hidden; }
  .section-head{
    display:flex; align-items:center; justify-content:space-between; padding:13px 18px;
    border-bottom:1px solid var(--border); font-size:13px; font-weight:650;
  }
  .section-empty{ padding:22px 18px; font-size:12.5px; color:var(--text-muted); text-align:center; }
  .tabs-bar{
    display:flex; align-items:center; justify-content:space-between; gap:12px;
    flex-wrap:wrap; margin-bottom:18px;
  }
  .tabs-bar .sub-tabs{ margin-bottom:0; }
  .tabs-actions{ display:flex; gap:8px; flex-wrap:wrap; }
  .sub-tabs{
    display:flex; gap:4px; background:var(--surface-2); border-radius:11px; padding:4px;
    margin-bottom:18px; flex-shrink:0; overflow-x:auto; -webkit-overflow-scrolling:touch;
  }
  .sub-tabs button{ flex-shrink:0; }
  .sub-tabs button{
    display:flex; align-items:center; justify-content:center; gap:7px; padding:9px 14px;
    border:none; background:transparent; border-radius:8px; font-size:12.5px; font-weight:600;
    color:var(--text-muted); white-space:nowrap; transition:background .15s, color .15s;
  }
  .sub-tabs button.on{ background:var(--surface); color:var(--accent-strong); box-shadow:var(--shadow-sm); }
  .tab-count{
    font-size:10.5px; font-weight:700; background:var(--surface-3); color:var(--text-muted);
    padding:1px 6px; border-radius:999px;
  }
  .sub-tabs button.on .tab-count{ background:var(--accent-soft); color:var(--accent-strong); }
  .mode-switch{
    display:flex; gap:4px; background:var(--surface-2); border-radius:11px; padding:4px; margin-bottom:16px;
  }
  .mode-switch button{
    flex:1; display:flex; align-items:center; justify-content:center; gap:6px; padding:9px;
    border:none; background:transparent; border-radius:8px; font-size:12.5px; font-weight:600;
    color:var(--text-muted); transition:background .15s, color .15s;
  }
  .mode-switch button.on{ background:var(--surface); color:var(--accent-strong); box-shadow:var(--shadow-sm); }
  .group-banner{
    display:flex; align-items:center; gap:8px; background:var(--accent-soft); color:var(--accent-strong);
    border-radius:10px; padding:10px 12px; font-size:12.5px; margin-bottom:14px;
  }
  .room-picker{
    background:var(--surface-2); border-radius:12px; padding:12px;
    max-height:260px; overflow-y:auto; -webkit-overflow-scrolling:touch; overscroll-behavior:contain;
  }
  .room-picker-group + .room-picker-group{ margin-top:12px; border-top:1px solid var(--border); padding-top:12px; }
  .room-picker-head{
    display:flex; align-items:center; justify-content:space-between; font-size:11px; font-weight:700;
    text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted); margin-bottom:8px;
  }
  .tag-row{ display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; }
  .tag-mini{
    font-size:10px; font-weight:700; background:var(--accent-soft); color:var(--accent-strong);
    padding:2px 7px; border-radius:5px; text-transform:uppercase; letter-spacing:.03em;
  }
  .bar-vip{
    font-size:8.5px; font-weight:800; background:currentColor; color:var(--surface);
    padding:1px 4px; border-radius:3px; flex-shrink:0; letter-spacing:.04em;
  }
  .tag-add{ display:inline-flex; align-items:center; gap:5px; border-style:dashed; }
  .tag-new{ display:inline-flex; align-items:center; gap:5px; }
  .tag-new input{
    width:150px; padding:7px 11px; border:1px solid var(--accent); border-radius:var(--r-pill);
    font-size:var(--fs-sm); background:var(--surface); color:var(--text);
  }
  .tag-picker{ display:flex; flex-wrap:wrap; gap:6px; }
  .tag-chip{
    padding:7px 12px; border-radius:999px; border:1px solid var(--border); background:var(--surface);
    font-size:12px; font-weight:600; color:var(--text-2); transition:all .12s;
  }
  .tag-chip:hover{ border-color:var(--accent); }
  .tag-chip.on{ background:var(--accent); border-color:var(--accent); color:#fff; }
  .st-noshow{ background:var(--warning-soft); color:var(--warning); border:1px solid rgba(154,117,36,.35); }
  .cal-bar.block-bar{
    background:repeating-linear-gradient(45deg, var(--surface-3), var(--surface-3) 6px, var(--surface-2) 6px, var(--surface-2) 12px);
    color:var(--text-2); border:1px solid var(--border);
  }
  .room-chips{ display:flex; flex-wrap:wrap; gap:6px; }
  .room-chip{
    padding:7px 11px; border-radius:8px; border:1px solid var(--border); background:var(--surface);
    font-size:12px; font-weight:600; font-family:'IBM Plex Mono',monospace; color:var(--text-2);
    transition:all .12s;
  }
  .room-chip:hover{ border-color:var(--accent); }
  .room-chip.on{ background:var(--accent); border-color:var(--accent); color:#fff; }
  .room-chip.busy{ opacity:.45; text-decoration:line-through; }
  .room-chip.busy.on{ background:var(--danger); border-color:var(--danger); opacity:1; text-decoration:line-through; }
  .guest-results{ border:1px solid var(--border); border-radius:12px; overflow:hidden; background:var(--surface); }
  .guest-result{
    display:flex; align-items:center; gap:11px; width:100%; padding:10px 12px; border:none;
    background:transparent; text-align:left; transition:background .12s;
  }
  .guest-result + .guest-result{ border-top:1px solid var(--border-soft); }
  .guest-result:hover{ background:var(--accent-soft); }
  .guest-chip{
    display:flex; align-items:center; gap:11px; border:1px solid var(--accent);
    background:var(--accent-soft); border-radius:12px; padding:10px 12px;
  }
  .guest-chip-body{ flex:1; min-width:0; }
  .guest-chip-av{
    width:34px; height:34px; border-radius:50%; background:var(--accent); color:#fff; flex-shrink:0;
    display:flex; align-items:center; justify-content:center; font-size:11.5px; font-weight:700;
  }
  .gname{ font-size:13.5px; font-weight:600; }
  .gmeta{ font-size:11.5px; color:var(--text-muted); margin-top:1px; }
  .guest-none{
    border:1px dashed var(--border); border-radius:12px; padding:14px; text-align:center;
    font-size:13px; color:var(--text-muted);
  }
  .subform-head{
    display:flex; align-items:center; justify-content:space-between; gap:10px;
    font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em;
    color:var(--text-muted); margin-bottom:12px;
  }

  .empty-state{
    text-align:center; padding:56px 24px; color:var(--text-muted);
    background:var(--surface); border:1px dashed var(--border); border-radius:var(--radius);
  }
  .empty-state svg{
    color:var(--accent); background:var(--accent-soft); border-radius:var(--r-lg);
    padding:12px; box-sizing:content-box; margin-bottom:4px;
  }
  .empty-state h4{ color:var(--text); margin:12px 0 4px; font-size:var(--fs-lg); }
  .empty-state p{ margin:0; font-size:var(--fs-base); max-width:340px; margin-inline:auto; line-height:1.55; }
  .group-summary{
    display:flex; gap:16px; flex-wrap:wrap; background:var(--surface-2); border-radius:var(--r-md);
    padding:11px 14px; margin-bottom:12px; font-size:var(--fs-sm); color:var(--text-muted);
  }
  .group-summary strong{ color:var(--text); font-size:var(--fs-md); }
  .grp-rows{ display:flex; flex-direction:column; gap:10px; margin-bottom:12px; }
  .grp-row{ border:1px solid var(--border); border-radius:var(--r-md); padding:11px; background:var(--surface); }
  .grp-row-head{ display:flex; gap:8px; align-items:center; }
  .grp-row-head select{
    flex:1; min-width:0; padding:9px 11px; border:1px solid var(--border);
    border-radius:var(--r-sm); font-size:var(--fs-base); background:var(--surface); color:var(--text);
  }
  .grp-period{
    background:var(--accent-soft); border-radius:var(--r-md); padding:12px 13px; margin-bottom:12px;
  }
  .grp-period-head{
    font-size:var(--fs-xs); font-weight:700; text-transform:uppercase; letter-spacing:.05em;
    color:var(--accent-strong);
  }
  .grp-period .grp-dates{ margin-top:8px; }
  .grp-period .grp-nights{ background:var(--surface); }
  .grp-period-hint{
    margin:9px 0 0; font-size:var(--fs-xs); color:var(--accent-strong); opacity:.8; line-height:1.45;
  }
  .grp-dates{ display:flex; align-items:flex-end; gap:8px; margin-top:9px; }
  .grp-dates .grp-num{ flex:1 1 0; }
  .grp-dates input{ font-size:var(--fs-sm); padding:8px 8px; }
  .grp-nights{
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    flex-shrink:0; background:var(--accent-soft); color:var(--accent-strong);
    border-radius:var(--r-sm); padding:6px 10px; font-size:var(--fs-2xs); font-weight:600;
    line-height:1.2; min-width:48px;
  }
  .grp-nights span{ font-size:var(--fs-lg); font-weight:700; }
  .grp-row-body{ display:flex; align-items:flex-end; gap:8px; margin-top:9px; }
  .grp-num{ display:flex; flex-direction:column; gap:3px; flex:1; min-width:0; }
  .grp-num span{ font-size:var(--fs-xs); font-weight:600; color:var(--text-muted); }
  .grp-num input{
    width:100%; max-width:100%; min-width:0; padding:8px 10px; border:1px solid var(--border);
    border-radius:var(--r-sm); font-size:var(--fs-base); background:var(--surface); color:var(--text);
  }
  .grp-num input[type="datetime-local"]{ -webkit-appearance:none; appearance:none; }
  .grp-price{
    margin-left:auto; font-size:var(--fs-md); font-weight:650; color:var(--accent-strong);
    white-space:nowrap; padding-bottom:8px;
  }
  .grp-occupant{
    display:flex; flex-direction:column; gap:6px; margin-top:9px; padding-top:9px;
    border-top:1px solid var(--border-soft);
  }
  .grp-occupant-head{ display:flex; align-items:baseline; justify-content:space-between; gap:8px; flex-wrap:wrap; }
  .grp-occupant-head > span{ font-size:var(--fs-xs); font-weight:600; color:var(--text-muted); }
  .grp-occupant-required{ font-size:var(--fs-2xs); font-weight:600; color:var(--danger, #b3452c); }
  .grp-occupant-row{ display:flex; gap:8px; flex-wrap:wrap; }
  .grp-occupant-row input{
    flex:1 1 120px; min-width:0; padding:8px 10px; border:1px solid var(--border); border-radius:var(--r-sm);
    font-size:var(--fs-base); background:var(--surface); color:var(--text);
  }
  .grp-occupant-row input::placeholder{ color:var(--text-muted); opacity:.7; }
  .grp-occupant-row input.input-error{ border-color:var(--danger, #b3452c); }
  .group-rooms{ display:flex; flex-wrap:wrap; gap:5px; }
  .room-tag{
    font-size:11px; font-weight:600; background:var(--accent-soft); color:var(--accent-strong);
    padding:3px 8px; border-radius:6px; white-space:nowrap;
  }
  .room-tag-more{ background:var(--surface-3); color:var(--text-muted); }

  /* ---------- Group table (Grupuri) ---------- */
  .truncate{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
  .group-table{ overflow-x:hidden; }
  .gt-row{
    display:grid;
    grid-template-columns:minmax(0,1.7fr) minmax(0,150px) minmax(0,1.3fr) auto;
    align-items:center; gap:16px; padding:14px 18px;
    border-bottom:1px solid var(--border-soft); transition:background .12s;
  }
  .gt-row:last-child{ border-bottom:none; }
  .gt-row:not(.gt-head):hover{ background:var(--surface-2); }
  .gt-head{
    padding:10px 18px; background:var(--surface-2); border-bottom:1px solid var(--border);
    font-size:var(--fs-xs); font-weight:700; text-transform:uppercase; letter-spacing:.05em;
    color:var(--text-muted);
  }
  .gt-col{ min-width:0; }
  .gt-col-name .primary{ font-weight:600; font-size:var(--fs-md); }
  .gt-col-name .secondary{ font-size:var(--fs-sm); color:var(--text-muted); margin-top:2px; }
  .gt-col-period{ font-size:var(--fs-sm); color:var(--text-2); }
  .gt-col-actions{ display:flex; justify-content:flex-end; gap:6px; }
  @media (max-width:720px){
    .gt-head{ display:none; }
    .gt-row{
      grid-template-columns:1fr auto;
      grid-template-areas:
        "name    actions"
        "period  actions"
        "rooms   actions";
      column-gap:10px; row-gap:4px; padding:14px 16px;
    }
    .gt-col-name{ grid-area:name; }
    .gt-col-period{ grid-area:period; }
    .gt-col-rooms{ grid-area:rooms; }
    .gt-col-actions{ grid-area:actions; align-self:center; justify-content:flex-end; }
  }
  .badge-count{ font-size:11px; background:var(--surface-2); padding:2px 8px; border-radius:999px; color:var(--text-muted); }
  .note{
    font-size:12.5px; color:var(--text-muted); background:var(--surface-2); border-radius:8px; padding:10px 12px; margin-bottom:16px;
    line-height:1.5;
  }

  /* ---------- Responsive overrides (must stay last: same-specificity rules earlier
     in this stylesheet would otherwise win by source order and silently defeat these) ---------- */
  @media (max-width:600px){
    .modal{ padding:18px 16px calc(18px + env(safe-area-inset-bottom)); }
    .field-row{ grid-template-columns:1fr; gap:0; }
    .field-row-2col{ grid-template-columns:1fr 1fr; gap:10px; }
    .grp-dates{ flex-direction:column; align-items:stretch; }
    .grp-dates .grp-nights{ flex-direction:row; justify-content:center; gap:5px; }
    .price-box{ padding:11px 12px; gap:10px; }
    .pb-manual{ width:98px; }
    .price-value{ font-size:var(--fs-xl); }
    .today-cols{ grid-template-columns:1fr; }
    .settings-grid{ grid-template-columns:1fr; }
    .tabs-bar{ flex-direction:column; align-items:stretch; gap:10px; }
    .tabs-bar .sub-tabs{ width:100%; }
    .tabs-bar .sub-tabs button{ flex:1; }
    .tabs-actions{ width:100%; }
    .tabs-actions .btn{ flex:1; }
    .room-grid{ grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); }
    .action-head{ flex-direction:column; align-items:flex-start; gap:8px; }
  }
  @media (max-width:400px){
    .top-btn span{ display:none; }
    .top-btn{ padding:9px 10px; }
  }
  @media (max-width:860px){
    .cal-occ{ flex-direction:row; gap:4px; }
    .occ-pct::before{ content:"• "; }
    .cal-legend{
      flex-wrap:nowrap; overflow-x:auto; -webkit-overflow-scrolling:touch;
      gap:6px; font-size:var(--fs-3xs);
    }
    .legend-item{ flex-shrink:0; gap:2px; white-space:nowrap; }
    .legend-chip{ width:12px; height:12px; font-size:8px; }
  }

  /* Calendar: camerele curg in pagina (scroll vertical normal, la orice
     latime); meniul principal urca odata cu pagina, iar doar bara
     Azi/Rezervare ramane fixa sus, cu un mic spatiu deasupra. cal-scroll
     pastreaza doar scroll orizontal. .content-cal scoate overflow-x:auto
     (care ii cupleaza automat si overflow-y, transformand-o intr-un
     container de scroll ce ar bloca position:sticky sa ajunga la scroll-ul
     real al paginii) — scroll-ul orizontal ramane oricum acoperit de
     cal-scroll insusi. */
  .topbar-cal{ position:static; }
  .content-cal{ overflow-x:visible; }
  .cal-scroll{ max-height:none; overflow-y:visible; }
  .cal-foot{ position:static; }
  .cal-toolbar{
    position:sticky; top:0; z-index:15;
    background:var(--bg);
  }
`;

/* ---------------------------------------------------------------
   DATA HELPERS
----------------------------------------------------------------*/
const uid = () => Math.random().toString(36).slice(2, 10);

function seedCore() {
  const rooms = [];
  for (let n = 1001; n <= 1014; n++) {
    rooms.push({
      id: "r" + n, name: String(n), type: "tiny",
      boilerId: `shelly-boiler-${n}`, ventId: `shelly-vent-${n}`, sensiboId: `sensibo-${n}`,
    });
  }
  [1101, 1102].forEach((n) => {
    rooms.push({
      id: "r" + n, name: String(n), type: "loft",
      boilerId: `shelly-boiler-${n}`, ventId: `shelly-vent-${n}`, sensiboId: `sensibo-${n}`,
    });
  });
  const guests = [
    { id: "g1", lastName: "Popescu", firstName: "Andrei", name: "Popescu Andrei", phone: "0722 111 222", email: "andrei.popescu@example.com", address: "", city: "Cluj-Napoca", county: "Cluj", country: "România", notes: "" },
    { id: "g2", lastName: "Marin", firstName: "Elena", name: "Marin Elena", phone: "0733 222 333", email: "elena.marin@example.com", address: "", city: "București", county: "București", country: "România", notes: "Alergie la pene" },
    { id: "g3", lastName: "Ionescu", firstName: "Mihai", name: "Ionescu Mihai", phone: "0744 333 444", email: "", address: "", city: "", county: "Cluj", country: "România", notes: "" },
  ];
  const rates = {
    base: { tiny: 350, loft: 480 },
    seasons: [
      { id: uid(), name: "Vârf de sezon", start: "06-15", end: "09-15", tiny: 450, loft: 620 },
      { id: uid(), name: "Sărbători de iarnă", start: "12-20", end: "01-05", tiny: 500, loft: 680 },
    ],
  };
  return { rooms, guests, rates, tags: [...DEFAULT_TAGS] };
}

const ROOM_TYPE = {
  tiny: { label: "Tiny house", short: "Tiny" },
  loft: { label: "Loft", short: "Loft" },
};

const SEED_GROUP_ID = "grp-seed";

function seedReservations(core) {
  const now = new Date();
  const in40 = new Date(now.getTime() + 40 * 60000);
  const tomorrow6pm = new Date(now); tomorrow6pm.setDate(now.getDate() + 1); tomorrow6pm.setHours(18, 0, 0, 0);
  const checkout2 = new Date(now); checkout2.setDate(now.getDate() + 3); checkout2.setHours(11, 0, 0, 0);

  // Group demo: four tiny houses over a weekend, each with its own occupant.
  const gIn = new Date(now); gIn.setDate(now.getDate() + 2); gIn.setHours(15, 0, 0, 0);
  const gOut = new Date(now); gOut.setDate(now.getDate() + 4); gOut.setHours(11, 0, 0, 0);
  const groupRooms = [
    { room: "r1005", occupant: "Popescu Andrei", adults: 2, children: 1 },
    { room: "r1006", occupant: "Marin Elena", adults: 2, children: 0 },
    { room: "r1007", occupant: "Ionescu Mihai", adults: 2, children: 2 },
    { room: "r1008", occupant: "Dumitru Ana", adults: 1, children: 0 },
  ];

  return [
    {
      id: uid(), roomId: "r1003", guestId: "g1",
      checkin: in40.toISOString(), checkout: checkout2.toISOString(),
      status: "confirmed", notes: "", adults: 2, children: 0, source: "direct", tags: [], messages: [],
    },
    {
      id: uid(), roomId: "r1101", guestId: "g2",
      checkin: tomorrow6pm.toISOString(), checkout: new Date(tomorrow6pm.getTime() + 2 * 86400000).toISOString(),
      status: "confirmed", notes: "", adults: 2, children: 0, source: "booking", tags: ["VIP"], messages: [],
    },
    ...groupRooms.map((g) => ({
      id: uid(), roomId: g.room, guestId: "g1", groupId: SEED_GROUP_ID,
      checkin: gIn.toISOString(), checkout: gOut.toISOString(),
      status: "confirmed", notes: "", occupantName: g.occupant,
      adults: g.adults, children: g.children, source: "direct", tags: [], messages: [],
    })),
  ];
}

/* Minimal first-run demo data: one small group so a brand-new install
   isn't an empty calendar. */
function seedGroups() {
  return [{
    id: SEED_GROUP_ID,
    name: "Familia Popescu",
    mainGuestId: "g1",
    createdAt: new Date().toISOString(),
    notes: "",
  }];
}

const STATUS_LABEL = {
  confirmed: "Confirmată", checkedin: "Checked-in", checkedout: "Checked-out",
  noshow: "No-show", cancelled: "Anulată",
};
const STATUS_GLYPH = {
  confirmed: "●", checkedin: "▶", checkedout: "✓", noshow: "!", cancelled: "✕",
};
const STATUS_CLASS = {
  confirmed: "st-confirmed", checkedin: "st-checkedin", checkedout: "st-checkedout",
  noshow: "st-noshow", cancelled: "st-cancelled",
};

/* Statuses that no longer hold the room. */
const DEAD_STATUSES = ["cancelled", "noshow"];
const isLive = (r) => !DEAD_STATUSES.includes(r.status);

function isSameDay(a, b) {
  const x = new Date(a), y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function isToday(d) { return isSameDay(d, new Date()); }

/* Single source of truth for which transitions are legal.
   Guards both the buttons and the actions they call. */
const canCheckIn  = (r, now = new Date()) => r.status === "confirmed" && isSameDay(r.checkin, now);
const canCheckOut = (r) => r.status === "checkedin";
const canCancel   = (r) => r.status === "confirmed";
function validateStay(checkin, checkout) {
  const ci = new Date(checkin), co = new Date(checkout);
  if (isNaN(ci.getTime())) return "Data de check-in nu este validă.";
  if (isNaN(co.getTime())) return "Data de check-out nu este validă.";
  if (co <= ci) return "Data de check-out trebuie să fie după check-in.";
  if (nightsBetween(ci, co) > 365) return "Sejurul depășește 365 de nopți — verifică datele.";
  return null;
}

function validatePrice(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return "Prețul manual trebuie să fie un număr.";
  if (n < 0) return "Prețul manual nu poate fi negativ.";
  if (n > 1000000) return "Prețul manual pare eronat.";
  return null;
}

const canNoShow   = (r, now = new Date()) =>
  r.status === "confirmed" && startOfDay(r.checkin) < startOfDay(now);

const SOURCES = [
  { key: "direct", label: "Direct" },
  { key: "phone", label: "Telefon" },
  { key: "walkin", label: "Walk-in" },
  { key: "booking", label: "Booking.com" },
  { key: "airbnb", label: "Airbnb" },
  { key: "other", label: "Altă agenție" },
];
const sourceLabel = (k) => SOURCES.find((x) => x.key === k)?.label || "—";

const DEFAULT_TAGS = [
  "VIP", "Client fidel", "Aniversare", "Sosire târzie",
  "Pat suplimentar", "Animal de companie", "Necesită factură",
];
const ROLE_LABEL = { admin: "Admin", receptionist: "Recepționer", housekeeping: "Cameristă" };

function nightsBetween(ci, co) {
  const a = new Date(ci); a.setHours(0, 0, 0, 0);
  const b = new Date(co); b.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((b - a) / 86400000));
}

function inSeason(date, season) {
  const md = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  if (season.start <= season.end) return md >= season.start && md <= season.end;
  return md >= season.start || md <= season.end; // wraps across new year
}

/* occupancy = {adults, children}; implicit 2 adulti/0 copii (ocuparea
   standard) cand nu se cunoaste rezervarea (ex. rapoarte agregate).
   Single (tarif redus) se aplica STRICT la 1 adult si 0 copii. Peste
   ocuparea standard, suplimentul de adult se aplica per adult peste 2,
   iar suplimentul de copil se aplica pentru fiecare copil, indiferent
   de ocuparea totala. */
function nightlyRate(date, roomType, rates, occupancy) {
  if (!rates) return 0;
  const adultsRaw = Number(occupancy?.adults);
  const adults = Number.isFinite(adultsRaw) ? adultsRaw : 2;
  const childrenRaw = Number(occupancy?.children);
  const children = Number.isFinite(childrenRaw) ? childrenRaw : 0;
  const season = (rates.seasons || []).find((sn) => inSeason(date, sn));
  const src = season || rates.base;
  const standard = Number(src?.[roomType] ?? rates.base?.[roomType] ?? 0);
  if (adults === 1 && children === 0) {
    const single = Number(rates.base?.[roomType + "Single"]) || 0;
    if (single > 0) return single;
  }
  const adultSupplement = Number(rates.base?.adultSupplement) || 0;
  const childSupplement = Number(rates.base?.childSupplement) || 0;
  return standard + Math.max(0, adults - 2) * adultSupplement + children * childSupplement;
}

/* Calcul LIVE, mereu proaspat din tarifele curente — folosit doar ca sa
   producem un nou pret inghetat (la creare/editare) sau ca ultim fallback
   pentru rezervari vechi care inca nu au un snapshot. NU se foloseste
   direct pentru afisare — vezi reservationTotal mai jos. */
function liveReservationTotal(res, core) {
  const room = core.rooms.find((r) => r.id === res.roomId);
  if (!room) return 0;
  const n = nightsBetween(res.checkin, res.checkout);
  const occupancy = { adults: res.adults ?? 2, children: res.children ?? 0 };
  let total = 0;
  const d = new Date(res.checkin); d.setHours(0, 0, 0, 0);
  for (let i = 0; i < n; i++) {
    total += nightlyRate(d, room.type, core.rates, occupancy);
    d.setDate(d.getDate() + 1);
  }
  return total;
}

/* Pretul afisat/facturat: suprascrierea manuala are mereu prioritate;
   apoi pretul inghetat la creare (sau la ultima modificare de
   data/ocupare/camera) — asa raman neschimbate rezervarile deja facute
   cand se modifica doar tarifele, nu si rezervarea insasi. Calculul
   live e ultim fallback, doar pentru rezervari vechi fara snapshot
   inca (migrate automat la incarcarea aplicatiei — vezi backfillBookedPrices). */
function reservationTotal(res, core) {
  if (res.priceOverride != null && res.priceOverride !== "") {
    const n = Number(res.priceOverride);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  if (res.bookedPrice != null && res.bookedPrice !== "") {
    const n = Number(res.bookedPrice);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return liveReservationTotal(res, core);
}

/* Limiteaza adulti+copii la capacitatea camerei — apelata din onChange,
   cu valoarea CEALALTA (deja introdusa) ca sa nu depaseasca suma. */
function clampOccupant(newVal, otherVal, capacity, min) {
  const cap = Number(capacity) || 20;
  const n = Math.max(min, Number(newVal) || min);
  return Math.min(n, Math.max(min, cap - (Number(otherVal) || 0)));
}

/* Intl formatters are expensive to construct (far more than to use), and
   these run hundreds of times per render in lists, the calendar and
   reports — so build each one once at module level. */
const FMT_MONEY = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 });
const FMT_DATE = new Intl.DateTimeFormat("ro-RO", { day: "2-digit", month: "2-digit" });
const FMT_DATETIME = new Intl.DateTimeFormat("ro-RO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const FMT_DATE_FULL = new Intl.DateTimeFormat("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric" });
const FMT_TIME = new Intl.DateTimeFormat("ro-RO", { hour: "2-digit", minute: "2-digit" });
const FMT_WEEKDAY = new Intl.DateTimeFormat("ro-RO", { weekday: "short" });
const FMT_MONTH_YEAR = new Intl.DateTimeFormat("ro-RO", { month: "long", year: "numeric" });

function fmtMoney(v) {
  return FMT_MONEY.format(Math.round(v || 0)) + " lei";
}

function fmtDate(d) {
  return FMT_DATE.format(new Date(d));
}
function fmtDateFull(d) {
  return FMT_DATE_FULL.format(new Date(d));
}
function fmtDateTime(d) {
  return FMT_DATETIME.format(new Date(d));
}
function toDateInput(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
function toLocalInputValue(iso) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

/* ---------------------------------------------------------------
   STORAGE LAYER
----------------------------------------------------------------*/
/* ---------------------------------------------------------------
   STRAT DE DATE — tabele reale in Supabase
   Citirile aduc fiecare tabel separat; scrierile compara lista veche
   cu cea noua si trimit DOAR randurile schimbate, ca doua persoane
   care lucreaza simultan sa nu se suprascrie reciproc.
----------------------------------------------------------------*/
const camelRes = (r) => ({
  id: r.id, roomId: r.room_id, guestId: r.guest_id, groupId: r.group_id,
  checkin: r.checkin, checkout: r.checkout, status: r.status,
  adults: r.adults, children: r.children, priceOverride: r.price_override,
  bookedPrice: r.booked_price,
  source: r.source, tags: r.tags || [], notes: r.notes || "",
  occupantLastName: r.occupant_last_name || "", occupantFirstName: r.occupant_first_name || "",
  occupantPhone: r.occupant_phone || "", occupantName:
    [r.occupant_last_name, r.occupant_first_name].filter(Boolean).join(" "),
  messages: r.messages || [], seeded: r.seeded,
});
const snakeRes = (r) => ({
  id: r.id, room_id: r.roomId, guest_id: r.guestId || null, group_id: r.groupId || null,
  checkin: new Date(r.checkin).toISOString(), checkout: new Date(r.checkout).toISOString(),
  status: r.status, adults: r.adults ?? 2, children: r.children ?? 0,
  price_override: r.priceOverride ?? null, booked_price: r.bookedPrice ?? null,
  source: r.source || "direct",
  tags: r.tags || [], notes: r.notes || null,
  occupant_last_name: r.occupantLastName || null,
  occupant_first_name: r.occupantFirstName || null,
  occupant_phone: r.occupantPhone || null,
  messages: r.messages || [], seeded: !!r.seeded,
});
const camelGuest = (g) => ({
  id: g.id, lastName: g.last_name, firstName: g.first_name, name:
    [g.last_name, g.first_name].filter(Boolean).join(" "),
  phone: g.phone, email: g.email || "", address: g.address || "",
  city: g.city, county: g.county, country: g.country, notes: g.notes || "", seeded: g.seeded,
});
const snakeGuest = (g) => ({
  id: g.id, last_name: g.lastName || "-", first_name: g.firstName || "-",
  phone: g.phone || "-", email: g.email || null, address: g.address || null,
  city: g.city || "-", county: g.county || "-", country: g.country || "România",
  notes: g.notes || null, seeded: !!g.seeded,
});
const camelRoom = (r) => ({
  id: r.id, name: r.name, type: r.type, capacity: r.capacity,
  boilerId: r.shelly_id || "", ventId: r.vent_id || "", sensiboId: r.sensibo_id || "",
  icalToken: r.ical_token, sortOrder: r.sort_order,
});
const snakeRoom = (r, idx) => ({
  id: r.id, name: r.name, type: r.type, capacity: r.capacity ?? 2,
  shelly_id: r.boilerId || null, vent_id: r.ventId || null, sensibo_id: r.sensiboId || null,
  sort_order: r.sortOrder ?? idx,
});
const camelGroup = (g) => ({
  id: g.id, name: g.name, mainGuestId: g.main_guest_id,
  notes: g.notes || "", createdAt: g.created_at, seeded: g.seeded,
});
const snakeGroup = (g) => ({
  id: g.id, name: g.name, main_guest_id: g.mainGuestId || null,
  notes: g.notes || null, seeded: !!g.seeded,
});

/* Trimite doar diferentele: randuri noi/modificate prin upsert,
   randuri disparute prin delete. */
async function syncTable(table, before, after, toRow) {
  const prevById = new Map((before || []).map((x) => [x.id, x]));
  const nextById = new Map((after || []).map((x) => [x.id, x]));
  const schimbate = (after || [])
    .map((x, idx) => [x, idx])
    .filter(([x]) => {
      const old = prevById.get(x.id);
      return !old || JSON.stringify(x) !== JSON.stringify(old);
    })
    .map(([x, idx]) => toRow(x, idx));
  const sterse = (before || []).filter((x) => !nextById.has(x.id)).map((x) => x.id);

  if (sterse.length) {
    const { error } = await supabase.from(table).delete().in("id", sterse);
    if (error) throw error;
  }
  if (schimbate.length) {
    const { error } = await supabase.from(table).upsert(schimbate, { onConflict: "id" });
    if (error) throw error;
  }
}

/* rates/seasons au forma diferita de restul tabelelor (rates: o linie per
   tip de camera; seasons: cheie compusa id+room_type, o "linie logica" din
   JS devine 2 randuri, cate unul per tip) — nu se potrivesc cu syncTable,
   asa ca le sincronizam separat. Suplimentele sunt globale, nu per tip de
   camera, dar se scriu pe ambele randuri din rates ca sa ramana totul
   intr-un singur tabel. */
async function saveRatesAndSeasons(beforeRates, afterRates) {
  const base = afterRates.base || {};
  const rateRows = ["tiny", "loft"].map((t) => ({
    room_type: t,
    base_price: Number(base[t]) || 0,
    single_price: base[t + "Single"] ? Number(base[t + "Single"]) : null,
    adult_supplement: Number(base.adultSupplement) || 0,
    child_supplement: Number(base.childSupplement) || 0,
  }));
  const { error: rateErr } = await supabase.from("rates").upsert(rateRows, { onConflict: "room_type" });
  if (rateErr) throw rateErr;

  const beforeIds = new Set((beforeRates.seasons || []).map((s) => s.id));
  const afterIds = new Set((afterRates.seasons || []).map((s) => s.id));
  const removedIds = [...beforeIds].filter((id) => !afterIds.has(id));
  if (removedIds.length) {
    const { error } = await supabase.from("seasons").delete().in("id", removedIds);
    if (error) throw error;
  }
  const seasonRows = (afterRates.seasons || []).flatMap((s) => ["tiny", "loft"].map((t) => ({
    id: s.id, name: s.name, start_md: s.start, end_md: s.end,
    room_type: t, price: Number(s[t]) || 0, priority: 0,
  })));
  if (seasonRows.length) {
    const { error } = await supabase.from("seasons").upsert(seasonRows, { onConflict: "id,room_type" });
    if (error) throw error;
  }
}

async function loadAll() {
  const [rooms, guests, groups, res, rates, seasons] = await Promise.all([
    supabase.from("rooms").select("*").order("sort_order"),
    supabase.from("guests").select("*"),
    supabase.from("res_groups").select("*"),
    supabase.from("reservations").select("*"),
    supabase.from("rates").select("*").order("room_type"),
    supabase.from("seasons").select("*"),
  ]);
  for (const r of [rooms, guests, groups, res, rates, seasons]) if (r.error) throw r.error;

  const base = {};
  rates.data.forEach((r) => {
    base[r.room_type] = Number(r.base_price);
    base[r.room_type + "Single"] = r.single_price != null ? Number(r.single_price) : 0;
    base.adultSupplement = Number(r.adult_supplement) || 0;
    base.childSupplement = Number(r.child_supplement) || 0;
  });
  const sez = {};
  seasons.data.forEach((s) => {
    sez[s.id] = sez[s.id] || { id: s.id, name: s.name, start: s.start_md, end: s.end_md };
    sez[s.id][s.room_type] = Number(s.price);
  });

  return {
    rooms: rooms.data.map(camelRoom),
    guests: guests.data.map(camelGuest),
    groups: groups.data.map(camelGroup),
    reservations: res.data.filter((r) => r.source !== "blocaj").map(camelRes),
    blocks: res.data.filter((r) => r.source === "blocaj").map((b) => ({
      id: b.id, roomId: b.room_id, start: b.checkin, end: b.checkout, reason: b.notes || "",
    })),
    rates: { base, seasons: Object.values(sez) },
  };
}

const K = {
  core: "pms:core:v3",
  res: "pms:reservations:v3",
  hk: "pms:housekeeping:v3",
  groups: "pms:groups:v3",
  log: "pms:log:v3",
  blocks: "pms:blocks:v3",
};

/* Audit log — module-level so any component can record an action
   without threading a callback through every layer. */
const audit = {
  user: null,
  entries: [],
  setEntries: null,
  async push(action, detail) {
    const entry = {
      id: uid(), ts: new Date().toISOString(),
      userName: audit.user?.name || "?", userRole: audit.user?.role || "?",
      action, detail,
    };
    const next = [entry, ...audit.entries].slice(0, 400);
    audit.entries = next;
    if (audit.setEntries) audit.setEntries(next);
    await saveShared(K.log, next);
  },
};

async function loadShared(key, fallback) {
  try {
    const { data, error } = await supabase
      .from("app_state").select("value").eq("key", key).maybeSingle();
    if (error) throw error;
    const parsed = data ? data.value : null;
    if (parsed == null) return fallback;
    if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
    if (fallback && typeof fallback === "object" && !Array.isArray(fallback)
      && (typeof parsed !== "object" || Array.isArray(parsed))) return fallback;
    return parsed;
  } catch (e) {
    console.error("Storage read failed", key, e);
    return fallback;
  }
}
async function saveShared(key, value) {
  try {
    const { error } = await supabase
      .from("app_state")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error("Storage save failed", key, e);
    return false;
  }
}

/* ---------------------------------------------------------------
   ERROR BOUNDARY
   A render error anywhere below would otherwise leave a blank or
   half-drawn screen with no way out.
----------------------------------------------------------------*/
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("PMS render error", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="pms">
          <style>{STYLES}</style>
          <div className="login-wrap">
            <div className="boot boot-error">
              <AlertTriangle size={24} />
              <div>
                <strong>Ceva n-a mers bine</strong>
                <p>{this.state.error?.message || "Eroare neașteptată în interfață."}</p>
              </div>
              <button className="btn btn-primary" onClick={() => this.setState({ error: null })}>
                <RefreshCw size={15} /> Reîncarcă interfața
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ---------------------------------------------------------------
   TOASTS
   Destructive actions are reversible for a few seconds instead of
   being guarded by another confirmation prompt.
----------------------------------------------------------------*/
const toaster = {
  push: null,
  show(message, opts = {}) {
    if (toaster.push) toaster.push({ id: uid(), message, ...opts });
  },
};

function ToastHost() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    toaster.push = (t) => {
      setItems((prev) => [...prev, t]);
      const ttl = t.onUndo ? 7000 : 3500;
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), ttl);
    };
    return () => { toaster.push = null; };
  }, []);

  const dismiss = (id) => setItems((prev) => prev.filter((x) => x.id !== id));

  if (!items.length) return null;
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {items.map((t) => (
        <div className={"toast" + (t.tone ? " toast-" + t.tone : "")} key={t.id}>
          <span className="toast-msg">{t.message}</span>
          {t.onUndo && (
            <button className="toast-undo" onClick={() => { t.onUndo(); dismiss(t.id); }}>
              <Undo2 size={14} /> Anulează
            </button>
          )}
          <button className="toast-x" onClick={() => dismiss(t.id)} aria-label="Închide notificarea">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------
   DIALOG
   One primitive for every modal: Escape to close, focus trapped
   inside and restored on exit, correct ARIA roles, scroll lock.
----------------------------------------------------------------*/
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function Dialog({ title, onClose, children, className = "", overlayClassName = "", labelledBy }) {
  useModalLock();
  const ref = useRef(null);
  const restoreTo = useRef(null);
  const headingId = useRef(labelledBy || `dlg-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    restoreTo.current = document.activeElement;
    const node = ref.current;
    if (node) {
      const first = node.querySelector(FOCUSABLE);
      (first || node).focus({ preventScroll: true });
    }
    return () => {
      const el = restoreTo.current;
      if (el && typeof el.focus === "function") el.focus({ preventScroll: true });
    };
  }, []);

  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); onClose?.(); return; }
    if (e.key !== "Tab") return;
    const node = ref.current;
    if (!node) return;
    const items = Array.from(node.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <div className={"modal-overlay " + overlayClassName} onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId.current}
        tabIndex={-1}
        className={"modal " + className}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {title !== undefined && (
          <div className="modal-head">
            <h3 id={headingId.current}>{title}</h3>
            <button className="icon-btn" onClick={onClose} aria-label="Închide fereastra">
              <X size={16} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/* Locks the page behind an open dialog: without this the calendar
   underneath still pans sideways while you type. */
let modalLockCount = 0;
function useModalLock() {
  useEffect(() => {
    measureVisualViewport();
    const body = document.body;
    if (modalLockCount === 0) {
      body.dataset.pmsOverflow = body.style.overflow || "";
      body.style.overflow = "hidden";
      body.style.touchAction = "none";
    }
    modalLockCount += 1;
    return () => {
      modalLockCount = Math.max(0, modalLockCount - 1);
      if (modalLockCount === 0) {
        body.style.overflow = body.dataset.pmsOverflow || "";
        body.style.touchAction = "";
        delete body.dataset.pmsOverflow;
      }
    };
  }, []);
}

/* ---------------------------------------------------------------
   LOADED-DATA VALIDATION
   Storage can hold values written by an older build or a partial
   write. Anything that fails its shape check is rebuilt instead of
   crashing a screen deep in the app.
----------------------------------------------------------------*/
function validCore(c) {
  if (!c || typeof c !== "object") return false;
  return Array.isArray(c.rooms) && Array.isArray(c.guests);
}

function repairCore(c) {
  const seed = seedCore();
  if (!validCore(c)) return seed;
  return {
    ...c,
    rooms: c.rooms.filter((r) => r && r.id && r.name)
      .map((r) => ({ ...r, type: r.type === "loft" ? "loft" : "tiny" })),
    guests: c.guests.filter((g) => g && g.id),
    rates: (c.rates && c.rates.base) ? c.rates : seed.rates,
    tags: Array.isArray(c.tags) && c.tags.length ? c.tags : [...DEFAULT_TAGS],
  };
}

function repairReservations(list, core) {
  if (!Array.isArray(list)) return [];
  const roomIds = new Set(core.rooms.map((r) => r.id));
  return list.filter((r) =>
    r && typeof r.id === "string" && roomIds.has(r.roomId) &&
    !isNaN(new Date(r.checkin).getTime()) && !isNaN(new Date(r.checkout).getTime()) &&
    new Date(r.checkout) > new Date(r.checkin)
  ).map((r) => ({
    ...r,
    status: STATUS_LABEL[r.status] ? r.status : "confirmed",
    adults: Number.isFinite(Number(r.adults)) && Number(r.adults) > 0 ? Number(r.adults) : 2,
    children: Number.isFinite(Number(r.children)) && Number(r.children) >= 0 ? Number(r.children) : 0,
    occupantName: typeof r.occupantName === "string" ? r.occupantName : "",
    tags: Array.isArray(r.tags) ? r.tags : [],
    messages: Array.isArray(r.messages) ? r.messages : [],
  }));
}

function repairBlocks(list, core) {
  if (!Array.isArray(list)) return [];
  const roomIds = new Set(core.rooms.map((r) => r.id));
  return list.filter((b) =>
    b && b.id && roomIds.has(b.roomId) &&
    !isNaN(new Date(b.start).getTime()) && !isNaN(new Date(b.end).getTime()) &&
    new Date(b.end) > new Date(b.start));
}

/* Safari iOS raporteaza gresit 100vh (include zona ascunsa sub bara de
   adrese), iar 100dvh nu e suportat decat din iOS 15.4. window.visualViewport
   e sustinut din iOS 13 si da inaltimea vizibila reala — o punem intr-o
   variabila CSS pe care o foloseste fereastra modala pentru dimensionare.
   offsetTop conteaza la fel de mult: cand bara de adrese e vizibila, zona
   vizibila incepe mai jos decat y=0 al paginii, iar un element position:fixed
   cu top:0 se ancoreaza tot la y=0 (sub bara de adrese) daca nu scadem si
   asta — altfel varful ferestrei modale ramane ascuns/taiat.
   Valorile astea nu sunt stabile chiar de la incarcarea paginii — Safari
   le "aseaza" pe masura ce utilizatorul interactioneaza. De-aia le
   recitim si in useModalLock, nu doar o singura data la pornirea
   aplicatiei, ca fereastra sa fie corecta chiar daca utilizatorul
   deschide un popup fara sa fi derulat pagina inainte. */
function measureVisualViewport() {
  const vv = window.visualViewport;
  const h = vv ? vv.height : window.innerHeight;
  const top = vv ? vv.offsetTop : 0;
  document.documentElement.style.setProperty("--vvh", `${h}px`);
  document.documentElement.style.setProperty("--vvt", `${top}px`);
}

function useVisualViewportHeight() {
  useEffect(() => {
    measureVisualViewport();
    window.visualViewport?.addEventListener("resize", measureVisualViewport);
    window.visualViewport?.addEventListener("scroll", measureVisualViewport);
    window.addEventListener("resize", measureVisualViewport);
    return () => {
      window.visualViewport?.removeEventListener("resize", measureVisualViewport);
      window.visualViewport?.removeEventListener("scroll", measureVisualViewport);
      window.removeEventListener("resize", measureVisualViewport);
    };
  }, []);
}

/* ---------------------------------------------------------------
   ROOT APP
----------------------------------------------------------------*/
function PMSApp() {
  useVisualViewportHeight();
  const [loading, setLoading] = useState(true);
  const [core, setCore] = useState({ rooms: [], guests: [] });
  const [reservations, setReservations] = useState([]);
  const [housekeeping, setHousekeeping] = useState({});
  const [groups, setGroups] = useState([]);
  const [logEntries, setLogEntries] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [initError, setInitError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [view, setView] = useState("calendar");

  /* La refresh de pagina, Supabase are deja sesiunea in localStorage —
     o refolosim ca sa nu ceara login din nou de fiecare data. */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: st } = await supabase
            .from("staff").select("name, role").eq("user_id", session.user.id).maybeSingle();
          if (alive && st) setCurrentUser({ id: session.user.id, name: st.name, role: st.role });
        }
      } finally {
        if (alive) setAuthChecked(true);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setCurrentUser(null);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    let alive = true;
    (async () => {
      try {
        if (!currentUser) { if (alive) setLoading(false); return; }
        const db = await loadAll();
        // Setarile care nu au tabel propriu (useri, ore check-in etc.)
        // raman in app_state; restul vine acum din tabele reale.
        const settings = (await loadShared(K.core, null)) || {};
        const c = repairCore({
          ...settings,
          rooms: db.rooms,
          guests: db.guests,
          rates: db.rates,
        });
        /* Rezervarile facute inainte de pretul inghetat (bookedPrice) inca
           n-au un snapshot — le calculam o singura data, acum, cu tarifele
           curente, ca sa nu mai fie afectate de modificari viitoare de
           tarife. Scriere in fundal, fara sa blocheze incarcarea; no-op
           la urmatoarele porniri, odata ce fiecare rezervare are snapshot. */
        const rawRes = db.reservations;
        const r = rawRes.map((x) => (x.priceOverride == null && x.bookedPrice == null)
          ? { ...x, bookedPrice: liveReservationTotal(x, c) }
          : x);
        const backfilled = r.filter((x, i) => x !== rawRes[i]);
        if (backfilled.length) {
          syncTable("reservations", [], backfilled, snakeRes)
            .catch((e) => console.error("Backfill bookedPrice esuat", e));
        }
        const gr = db.groups.filter((g) => r.some((x) => x.groupId === g.id));
        const bl = db.blocks;

        let h = await loadShared(K.hk, null);
        if (!h || typeof h !== "object" || Array.isArray(h)) {
          h = {};
          c.rooms.forEach((rm) => { h[rm.id] = { status: "clean", updatedAt: new Date().toISOString() }; });
          await saveShared(K.hk, h);
        }
        let lg = await loadShared(K.log, []);
        if (!Array.isArray(lg)) lg = [];
        if (!alive) return;
        audit.entries = lg; audit.setEntries = setLogEntries;
        setCore(c); setReservations(r); setHousekeeping(h);
        setGroups(gr); setBlocks(bl); setLogEntries(lg);
      } catch (err) {
        console.error("PMS init failed", err);
        if (alive) setInitError(err?.message || "Eroare necunoscută la pornire.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [reloadKey, currentUser, authChecked]);

  /* Fiecare functie trimite doar randurile schimbate. Starea locala
     se actualizeaza imediat, iar daca scrierea esueaza (de ex. camera
     tocmai a fost ocupata de altcineva) eroarea ajunge la utilizator
     si datele se reincarca din baza. */
  const coreRef = useRef(core);
  useEffect(() => { coreRef.current = core; }, [core]);
  const resRef = useRef(reservations);
  useEffect(() => { resRef.current = reservations; }, [reservations]);
  const grRef = useRef(groups);
  useEffect(() => { grRef.current = groups; }, [groups]);
  const blRef = useRef(blocks);
  useEffect(() => { blRef.current = blocks; }, [blocks]);

  const raporteazaEroare = useCallback((e) => {
    const m = e?.message || "";
    toaster.show(
      m.includes("fara_suprapunere") || m.includes("exclusion")
        ? "Camera este deja ocupata in acea perioada."
        : "Salvarea a esuat: " + m,
      { tone: "danger" }
    );
    setReloadKey((k) => k + 1);
  }, []);

  const updateCore = useCallback(async (next) => {
    const before = coreRef.current;
    setCore(next);
    try {
      await syncTable("rooms", before.rooms, next.rooms, snakeRoom);
      await syncTable("guests", before.guests, next.guests, snakeGuest);
      if (next.rates !== before.rates) await saveRatesAndSeasons(before.rates || {}, next.rates || {});
      const { rooms, guests, rates, ...settings } = next;
      await saveShared(K.core, settings);
    } catch (e) { raporteazaEroare(e); }
  }, [raporteazaEroare]);

  const updateReservations = useCallback(async (next) => {
    const before = resRef.current;
    setReservations(next);
    try { await syncTable("reservations", before, next, snakeRes); }
    catch (e) { raporteazaEroare(e); }
  }, [raporteazaEroare]);

  const updateGroups = useCallback(async (next) => {
    const before = grRef.current;
    setGroups(next);
    try { await syncTable("res_groups", before, next, snakeGroup); }
    catch (e) { raporteazaEroare(e); }
  }, [raporteazaEroare]);

  const updateBlocks = useCallback(async (next) => {
    const before = blRef.current;
    setBlocks(next);
    try {
      await syncTable("reservations", before, next, (b) => ({
        id: b.id, room_id: b.roomId,
        checkin: new Date(b.start).toISOString(),
        checkout: new Date(b.end).toISOString(),
        status: "confirmed", source: "blocaj", notes: b.reason || null,
      }));
    } catch (e) { raporteazaEroare(e); }
  }, [raporteazaEroare]);

  const updateHousekeeping = useCallback(async (next) => {
    setHousekeeping(next); await saveShared(K.hk, next);
  }, []);

  useEffect(() => { audit.user = currentUser; }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      setView(defaultViewFor(currentUser.role));
    }
  }, [currentUser]);

  if (loading) {
    return (
      <div className="pms">
        <style>{STYLES}</style>
        <div className="skeleton-shell" aria-busy="true" aria-label="Se încarcă">
          <div className="sk sk-topbar" />
          <div className="skeleton-body">
            <div className="sk-row">
              {[0, 1, 2, 3].map((i) => <div className="sk sk-stat" key={i} />)}
            </div>
            <div className="sk sk-block" />
            <div className="sk-row">
              <div className="sk sk-panel" />
              <div className="sk sk-panel" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="pms">
        <style>{STYLES}</style>
        <div className="login-wrap">
          <div className="boot boot-error">
            <AlertTriangle size={24} />
            <div>
              <strong>Aplicația nu a putut porni</strong>
              <p>{initError}</p>
            </div>
            <button className="btn btn-primary" onClick={() => {
              setInitError(null); setLoading(true); setReloadKey((k) => k + 1);
            }}>
              <RefreshCw size={15} /> Încearcă din nou
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="pms">
        <style>{STYLES}</style>
        <Login onLogin={setCurrentUser} />
      </div>
    );
  }

  return (
    <div className="pms">
      <style>{STYLES}</style>
      <ToastHost />
      <Shell
        user={currentUser}
        view={view}
        setView={setView}
        onLogout={async () => { await supabase.auth.signOut(); setCurrentUser(null); }}
        core={core}
        updateCore={updateCore}
        reservations={reservations}
        updateReservations={updateReservations}
        housekeeping={housekeeping}
        updateHousekeeping={updateHousekeeping}
        groups={groups}
        updateGroups={updateGroups}
        blocks={blocks}
        updateBlocks={updateBlocks}
        logEntries={logEntries}
      />
    </div>
  );
}

/* ---------------------------------------------------------------
   LOGIN
----------------------------------------------------------------*/
function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: email.trim(), password,
      });
      if (authErr) throw authErr;
      const { data: st, error: stErr } = await supabase
        .from("staff").select("name, role").eq("user_id", data.user.id).maybeSingle();
      if (stErr) throw stErr;
      if (!st) {
        await supabase.auth.signOut();
        throw new Error("Contul nu are drepturi in aplicatie.");
      }
      onLogin({ id: data.user.id, name: st.name, role: st.role });
    } catch (e) {
      setError(e?.message || "Autentificare esuata.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <div className="mark"><DoorOpen size={18} /></div>
          <div>
            <h1>La Livada PMS</h1>
            <p>Autentifica-te pentru a continua</p>
          </div>
        </div>
        <label className="field">
          <span className="fl">Email</span>
          <input type="email" value={email} autoComplete="username"
            onChange={(e) => { setEmail(e.target.value); setError(""); }} />
        </label>
        <label className="field">
          <span className="fl">Parola</span>
          <input type="password" value={password} autoComplete="current-password"
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </label>
        <button className="btn btn-primary" onClick={submit}
          disabled={busy || !email.trim() || !password}>
          <ShieldCheck size={15} /> {busy ? "Se verifica..." : "Intra in cont"}
        </button>
        {error && <div className="error-text" role="alert">{error}</div>}
      </div>
    </div>
  );
}


/* ---------------------------------------------------------------
   APP SHELL — nav + routed content
----------------------------------------------------------------*/
/* Navigation lives in the top bar: the brand returns to Azi, Calendar sits
   beside it, and everything else is grouped under Setări. */
const SETTINGS_ITEMS = [
  { key: "clients", label: "Clienți", icon: Users, desc: "Oaspeți și grupuri", roles: ["admin", "receptionist"] },
  { key: "automation", label: "Automatizare", icon: Zap, desc: "Boiler, aer condiționat și ventilație înainte de sosire", roles: ["admin", "receptionist"] },
  { key: "rooms", label: "Camere și tarife", icon: DoorOpen, desc: "Numere, tip, dispozitive Shelly/Sensibo și prețuri", roles: ["admin"] },
  { key: "reports", label: "Rapoarte", icon: BarChart3, desc: "Ocupare, venit, ADR și RevPAR pe luni", roles: ["admin"] },
  { key: "users", label: "Useri și drepturi", icon: UserCog, desc: "Conturi și roluri", roles: ["admin"] },
  { key: "log", label: "Jurnal de activitate", icon: History, desc: "Cine ce a modificat și când", roles: ["admin"] },
];

const VIEW_TITLES = {
  today: ["Azi", "Sosiri, plecări și camere de pregătit"],
  reports: ["Rapoarte", "Ocupare, venituri și tarif mediu"],
  log: ["Jurnal de activitate", "Cine ce a modificat"],
  settings: ["Setări", "Configurare și administrare"],
  calendar: ["Calendar rezervări", "Vizualizare pe camere, următoarele 14 zile"],
  clients: ["Clienți", "Oaspeți și grupuri"],
  housekeeping: ["Status camere", "Curățenie și pregătire pentru sosiri"],
  automation: ["Automatizare pre-sosire", "Boiler · aer condiționat · ventilație"],
  rooms: ["Configurare camere", "Mapare dispozitive Shelly / Sensibo"],
  users: ["Useri și drepturi", "Acces pe roluri"],
  profile: ["Profilul meu", "Cont și securitate"],
};

function initials(name) {
  return name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}
/* Which screens each role may reach. Enforced on render, not just in the menu,
   so a view left over from another session can't leak through. */
const VIEW_ROLES = {
  today: ["admin", "receptionist"],
  calendar: ["admin", "receptionist"],
  housekeeping: ["admin", "receptionist", "housekeeping"],
  clients: ["admin", "receptionist"],
  automation: ["admin", "receptionist"],
  settings: ["admin", "receptionist"],
  profile: ["admin", "receptionist", "housekeeping"],
  rooms: ["admin"],
  reports: ["admin"],
  users: ["admin"],
  log: ["admin"],
  seed: ["admin"],
};
const mayView = (view, role) => (VIEW_ROLES[view] || []).includes(role);

function defaultViewFor(role) {
  return role === "housekeeping" ? "housekeeping" : "today";
}

function Shell({ user, view, setView, onLogout, core, updateCore, reservations, updateReservations, housekeeping, updateHousekeeping, groups, updateGroups, blocks, updateBlocks, logEntries }) {
  const [calendarIntent, setCalendarIntent] = useState(null);

  const settingsItems = SETTINGS_ITEMS.filter((i) => i.roles.includes(user.role));
  const homeView = defaultViewFor(user.role);
  const canCalendar = mayView("calendar", user.role);

  // Snap back to a permitted screen if the current one isn't allowed for this role.
  useEffect(() => {
    if (!mayView(view, user.role)) setView(homeView);
  }, [view, user.role, homeView, setView]);

  const safeView = mayView(view, user.role) ? view : homeView;
  const [title] = VIEW_TITLES[safeView] || ["", ""];

  return (
    <div className="shell">
      <div className="main">
        <header className={"topbar" + (safeView === "calendar" ? " topbar-cal" : "")}>
          <button className="brand-block" onClick={() => setView(homeView)} title="Înapoi la Azi">
            <span className="brand-mark"><DoorOpen size={16} /></span>
            <span className="brand-text">
              <span className="brand-name">La Livada</span>
              <span className="sub">{title}</span>
            </span>
          </button>

          <div className="topbar-actions">
            {canCalendar && (
              <button
                className={"top-btn" + (safeView === "calendar" ? " active" : "")}
                onClick={() => setView("calendar")}
                aria-label="Calendar"
              >
                <CalendarDays size={16} /> <span>Calendar</span>
              </button>
            )}
            {settingsItems.length > 0 && (
              <button
                className={"icon-btn gear-btn" + (["settings", ...settingsItems.map((i) => i.key)].includes(safeView) ? " active" : "")}
                onClick={() => setView("settings")}
                title="Setări"
                aria-label="Setări"
              >
                <Settings size={17} />
              </button>
            )}
            <button
              className={"avatar-btn" + (safeView === "profile" ? " active" : "")}
              onClick={() => setView("profile")}
              title={`${user.name} — ${ROLE_LABEL[user.role]}`}
              aria-label="Profilul meu"
            >
              {initials(user.name)}
            </button>
          </div>
        </header>

        <div className={"content" + (safeView === "calendar" ? " content-cal" : "")}>
          {safeView === "profile" && (
            <ProfileView user={user} onLogout={onLogout} onBack={() => setView(homeView)} />
          )}
          {safeView === "settings" && <SettingsView setView={setView} items={settingsItems} />}
          {safeView === "today" && (
            <TodayView core={core} reservations={reservations}
              updateReservations={updateReservations} housekeeping={housekeeping}
              updateHousekeeping={updateHousekeeping} setView={setView} groups={groups} />
          )}
          {safeView === "reports" && <ReportsView core={core} reservations={reservations} />}
          {safeView === "log" && <LogView entries={logEntries} />}
          {safeView === "calendar" && (
            <CalendarView core={core} updateCore={updateCore} reservations={reservations}
              updateReservations={updateReservations} groups={groups} updateGroups={updateGroups}
              housekeeping={housekeeping} updateHousekeeping={updateHousekeeping}
              blocks={blocks} updateBlocks={updateBlocks}
              intent={calendarIntent} clearIntent={() => setCalendarIntent(null)} />
          )}
          {safeView === "clients" && (
            <ClientsView core={core} updateCore={updateCore} groups={groups} updateGroups={updateGroups}
              reservations={reservations} updateReservations={updateReservations} blocks={blocks}
              onNewGroup={() => { setCalendarIntent("group"); setView("calendar"); }} />
          )}
          {safeView === "housekeeping" && (
            <HousekeepingView core={core} reservations={reservations} housekeeping={housekeeping} updateHousekeeping={updateHousekeeping} />
          )}
          {safeView === "automation" && <AutomationView core={core} reservations={reservations} />}
          {safeView === "rooms" && (
            <RoomsView core={core} updateCore={updateCore}
              reservations={reservations} updateReservations={updateReservations}
              blocks={blocks} updateBlocks={updateBlocks} />
          )}
          {safeView === "users" && <UsersView />}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   AUTOMATION STRIP — shared signature element (used on Calendar + Automation)
----------------------------------------------------------------*/
function computeTriggers(core, reservations, hoursAhead = 24) {
  const now = new Date();
  const horizon = new Date(now.getTime() + hoursAhead * 3600000);
  const list = [];
  reservations
    .filter((r) => r.status === "confirmed" || r.status === "checkedin")
    .forEach((r) => {
      const checkin = new Date(r.checkin);
      const trigger = new Date(checkin.getTime() - 60 * 60000); // -1h
      if (trigger > horizon) return;
      if (checkin < now && r.status !== "checkedin") return;
      const room = core.rooms.find((rm) => rm.id === r.roomId);
      if (!room) return;
      const diffMin = Math.round((trigger.getTime() - now.getTime()) / 60000);
      list.push({ reservation: r, room, checkin, trigger, diffMin });
    });
  return list.sort((a, b) => a.trigger - b.trigger);
}

function triggerLabel(diffMin) {
  if (diffMin <= 0) return { text: "Pornit", cls: "done" };
  if (diffMin < 60) return { text: `Pornește în ${diffMin} min`, cls: "soon" };
  const h = Math.floor(diffMin / 60), m = diffMin % 60;
  return { text: `Pornește în ${h}h ${m}min`, cls: "later" };
}

function AutomationStrip({ core, reservations }) {
  /* The countdown text is derived from "now", so without a tick it would
     freeze at whatever it read on first render — wrong within minutes on
     a screen left open at reception. */
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const triggers = useMemo(() => computeTriggers(core, reservations, 24), [core, reservations, tick]);
  if (triggers.length === 0) {
    return <div className="auto-empty">Nicio sosire în următoarele 24h — fără declanșări de automatizare programate.</div>;
  }
  return (
    <div className="auto-strip">
      {triggers.map((t) => {
        const lbl = triggerLabel(t.diffMin);
        return (
          <div className="auto-pill" key={t.reservation.id}>
            <span className={"dot " + lbl.cls} />
            <div>
              <div className="room">{t.room.name}</div>
              <div className="when">{lbl.text} · sosire {fmtDateTime(t.checkin)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------
   GROUP ROOMING LIST (printable)
----------------------------------------------------------------*/
function GroupPrint({ group, core, reservations, onClose }) {
  const rows = reservations
    .filter((r) => r.groupId === group.id)
    .sort((a, b) => (core.rooms.find((x) => x.id === a.roomId)?.name || "")
      .localeCompare(core.rooms.find((x) => x.id === b.roomId)?.name || ""));

  const main = core.guests.find((g) => g.id === group.mainGuestId);
  const ci = rows.length ? new Date(Math.min(...rows.map((r) => new Date(r.checkin)))) : null;
  const co = rows.length ? new Date(Math.max(...rows.map((r) => new Date(r.checkout)))) : null;
  const totAd = rows.reduce((n, r) => n + (r.adults ?? 2), 0);
  const totCh = rows.reduce((n, r) => n + (r.children ?? 0), 0);
  const totVal = rows.reduce((v, r) => v + reservationTotal(r, core), 0);
  const nightsPerRoom = rows.map((r) => nightsBetween(r.checkin, r.checkout));
  const totNights = nightsPerRoom.reduce((a, b) => a + b, 0);
  const minN = nightsPerRoom.length ? Math.min(...nightsPerRoom) : 0;
  const maxN = nightsPerRoom.length ? Math.max(...nightsPerRoom) : 0;
  const nightsLabel = !nightsPerRoom.length ? "—" : minN === maxN ? String(minN) : `${minN}–${maxN}`;
  const sameIn = rows.every((r) => isSameDay(r.checkin, rows[0].checkin));
  const sameOut = rows.every((r) => isSameDay(r.checkout, rows[0].checkout));
  const d = (v) => FMT_DATE_FULL.format(new Date(v)).replace(/\./g, "-");
  const ds = (v) => FMT_DATE.format(new Date(v)).replace(/\.$/, "");

  return (
    <Dialog onClose={onClose} className="arrival-modal" overlayClassName="arrival-overlay" title={undefined}>
      <div className="modal-head no-print">
        <h3>Listă cazare grup</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => window.print()}>
            <Printer size={15} /> Printează
          </button>
          <button className="icon-btn" onClick={onClose} aria-label="Închide fereastra"><X size={16} /></button>
        </div>
      </div>

      <div className="arrival-sheet">
        <div className="fisa rooming-sheet">
          <div className="fisa-top">
            <div className="fisa-logo">LA LIVADĂ</div>
            <div className="rs-meta">
              <div className="rs-meta-label">Listă cazare</div>
              <div className="rs-meta-value">{group.name}</div>
              <div className="rs-meta-date">Emisă {d(new Date())}</div>
            </div>
          </div>

          <div className="rs-summary">
            <div className="rs-line">
              <div className="rs-cell rs-grow">
                <span className="rs-k">Client principal</span>
                <span className="rs-v">{guestFullName(main) || "—"}</span>
              </div>
              <div className="rs-cell">
                <span className="rs-k">Nopți</span>
                <span className="rs-v">{nightsLabel}</span>
              </div>
              <div className="rs-cell">
                <span className="rs-k">Camere</span>
                <span className="rs-v">{rows.length}</span>
              </div>
              <div className="rs-cell">
                <span className="rs-k">Persoane</span>
                <span className="rs-v">{totAd + totCh}</span>
              </div>
            </div>
            <div className="rs-line">
              <div className="rs-cell rs-grow">
                <span className="rs-k">Data sosirii</span>
                <span className="rs-v">{ci ? d(ci) : "—"}{sameIn ? "" : " (diferite)"}</span>
              </div>
              <div className="rs-cell rs-grow">
                <span className="rs-k">Data plecării</span>
                <span className="rs-v">{co ? d(co) : "—"}{sameOut ? "" : " (diferite)"}</span>
              </div>
            </div>
          </div>

          <div className="rooming-wrap">
          <table className="rooming">
            <thead>
              <tr>
                <th className="c-num">#</th>
                <th className="c-room">Cameră</th>
                <th className="c-occ">Ocupant</th>
                <th className="c-d">Perioadă</th>
                <th className="c-n">Nopți</th>
                <th className="c-n">Pers.</th>
                <th className="c-sign">Semnătură</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const room = core.rooms.find((x) => x.id === r.roomId);
                const ad = r.adults ?? 2, ch = r.children ?? 0;
                return (
                  <tr key={r.id}>
                    <td className="c-num">{i + 1}</td>
                    <td className="c-room">
                      <span className="rs-room-no">{room?.name}</span>
                      <span className="rs-room-type">{ROOM_TYPE[room?.type]?.label}</span>
                    </td>
                    <td className="c-occ">{occupantName(r, core, group ? [group] : null) || ""}</td>
                    <td className="c-d">
                      <span className="rs-d1">{ds(r.checkin)}</span>
                      <span className="rs-d2">{ds(r.checkout)}</span>
                    </td>
                    <td className="c-n">{nightsBetween(r.checkin, r.checkout)}</td>
                    <td className="c-n c-tot">
                      {ad + ch}
                      {ch > 0 && <span className="rs-brk">{ad}+{ch}</span>}
                    </td>
                    <td className="c-sign" />
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="c-num" />
                <td className="c-room">Total</td>
                <td className="c-occ">{rows.length} camere</td>
                <td className="c-d" />
                <td className="c-n">{totNights}</td>
                <td className="c-n c-tot">
                  {totAd + totCh}
                  {totCh > 0 && <span className="rs-brk">{totAd}+{totCh}</span>}
                </td>
                <td className="c-sign" />
              </tr>
            </tfoot>
          </table>
          </div>

          <div className="rs-value">Valoare totală sejur: <strong>{fmtMoney(totVal)}</strong></div>

          <div className="rs-notes">
            <div className="rs-notes-title">Observații</div>
            <div className="rs-notes-lines"><span /><span /><span /></div>
          </div>

          <div className="sheet-sign">
            <div>Reprezentant grup</div>
            <div>Recepție</div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------
   GROUP EDITOR
   Rooms can be added, swapped or dropped, and occupancy set per
   room — all reservations of the group stay in step.
----------------------------------------------------------------*/
function GroupEditor({ group, core, groups, updateGroups, reservations, updateReservations, blocks, onClose, onPrint }) {
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  if (!group) return null;

  const rows = reservations
    .filter((r) => r.groupId === group.id)
    .sort((a, b) => (core.rooms.find((x) => x.id === a.roomId)?.name || "")
      .localeCompare(core.rooms.find((x) => x.id === b.roomId)?.name || ""));

  const span = rows.length
    ? {
        checkin: new Date(Math.min(...rows.map((r) => new Date(r.checkin)))).toISOString(),
        checkout: new Date(Math.max(...rows.map((r) => new Date(r.checkout)))).toISOString(),
      }
    : null;

  const groupRoomIds = new Set(rows.map((r) => r.roomId));

  /* Rooms taken by anything else live in this window (any reservation
     except exceptResId, plus maintenance blocks). Deliberately not
     special-cased by group: a room double-booked by two reservations
     of the *same* group is still a real conflict, so every other room
     is checked the same way regardless of which group it belongs to. */
  const busyIn = (fromISO, toISO, exceptResId) => {
    const set = new Set();
    const ci = new Date(fromISO), co = new Date(toISO);
    if (isNaN(ci.getTime()) || isNaN(co.getTime())) return set;
    for (const r of reservations) {
      if (!isLive(r) || r.id === exceptResId) continue;
      if (ci < new Date(r.checkout) && co > new Date(r.checkin)) set.add(r.roomId);
    }
    for (const b of blocks || []) {
      if (ci < new Date(b.end) && co > new Date(b.start)) set.add(b.roomId);
    }
    return set;
  };

  const busyRooms = span ? busyIn(span.checkin, span.checkout) : new Set();

  const freeRooms = core.rooms.filter((r) => !busyRooms.has(r.id) && !groupRoomIds.has(r.id));
  const totalGuests = rows.reduce((n, r) => n + (r.adults ?? 2) + (r.children ?? 0), 0);
  const namedRooms = rows.filter((r) =>
    r.occupantLastName?.trim() && r.occupantFirstName?.trim() && r.occupantPhone?.trim()).length;
  const nightsList = rows.map((r) => nightsBetween(r.checkin, r.checkout));
  const minN = nightsList.length ? Math.min(...nightsList) : 0;
  const maxN = nightsList.length ? Math.max(...nightsList) : 0;
  const totalValue = rows.reduce((v, r) => v + reservationTotal(r, core), 0);

  /* Recalculeaza bookedPrice doar cand se schimba ceva ce afecteaza pretul
     (data, ocupare, camera) si doar daca rezervarea nu are deja un pret
     manual — altfel un tarif modificat intre timp ar "sari" pe rezervari
     deja facute, fara sa fi fost editate cu adevarat. */
  const PRICE_AFFECTING = ["roomId", "checkin", "checkout", "adults", "children"];
  const patchRow = async (id, patch) => {
    const row = reservations.find((r) => r.id === id);
    let finalPatch = patch;
    if (row && row.priceOverride == null && PRICE_AFFECTING.some((f) => patch[f] !== undefined)) {
      finalPatch = { ...patch, bookedPrice: liveReservationTotal({ ...row, ...patch }, core) };
    }
    await updateReservations(reservations.map((r) => (r.id === id ? { ...r, ...finalPatch } : r)));
    setError("");
  };

  /* Keeps the free-text occupantName (used everywhere else for display)
     in sync whenever the structured last/first name fields change.
     Also seeds the two structured fields from any legacy combined
     occupantName the first time a room is edited, so an older/seeded
     row doesn't silently lose half its name on the first keystroke. */
  const patchOccupant = async (id, patch) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const [legacyLast, ...legacyRest] = (row.occupantName || "").trim().split(" ");
    const base = {
      occupantLastName: row.occupantLastName ?? legacyLast ?? "",
      occupantFirstName: row.occupantFirstName ?? legacyRest.join(" "),
      occupantPhone: row.occupantPhone ?? "",
    };
    const next = { ...base, ...patch };
    const combined = [next.occupantLastName, next.occupantFirstName]
      .filter((v) => v?.trim()).join(" ").trim();
    await patchRow(id, { ...base, ...patch, occupantName: combined });
  };

  /* Applies one period to every room, keeping each room's own time of day. */
  const shiftAll = async (newIn, newOut) => {
    const ci = newIn ? new Date(newIn) : new Date(span.checkin);
    const co = newOut ? new Date(newOut) : new Date(span.checkout);
    const err = validateStay(ci, co);
    if (err) { setError(err); return; }

    const clashes = rows.filter((r) =>
      busyIn(ci.toISOString(), co.toISOString(), r.id).has(r.roomId));
    if (clashes.length) {
      const names = clashes.map((r) => core.rooms.find((x) => x.id === r.roomId)?.name).join(", ");
      setError(`Ocupate în intervalul ales: ${names}`);
      return;
    }

    const ids = new Set(rows.map((r) => r.id));
    await updateReservations(reservations.map((r) => {
      if (!ids.has(r.id)) return r;
      const patched = { ...r, checkin: ci.toISOString(), checkout: co.toISOString() };
      return r.priceOverride == null ? { ...patched, bookedPrice: liveReservationTotal(patched, core) } : patched;
    }));
    await audit.push("Perioadă grup schimbată",
      `${group.name}: ${fmtDate(ci)} → ${fmtDate(co)} · ${rows.length} camere`);
    toaster.show(`Perioada grupului mutată pe ${fmtDate(ci)} → ${fmtDate(co)}`, { tone: "ok" });
    setError("");
  };

  /* Each room may run on its own dates — validate that room alone. */
  const changeDates = async (id, newIn, newOut) => {
    const row = rows.find((r) => r.id === id);
    const ci = newIn ? new Date(newIn) : new Date(row.checkin);
    const co = newOut ? new Date(newOut) : new Date(row.checkout);
    const err = validateStay(ci, co);
    if (err) { setError(err); return; }
    if (busyIn(ci.toISOString(), co.toISOString(), id).has(row.roomId)) {
      setError(`Camera ${core.rooms.find((x) => x.id === row.roomId)?.name} este ocupată în intervalul ales.`);
      return;
    }
    await patchRow(id, { checkin: ci.toISOString(), checkout: co.toISOString() });
    await audit.push("Interval schimbat în grup",
      `${group.name} · ${core.rooms.find((x) => x.id === row.roomId)?.name}: ${fmtDate(ci)} → ${fmtDate(co)}`);
  };

  const moveRow = async (id, newRoomId) => {
    const row = rows.find((r) => r.id === id);
    if (busyIn(row.checkin, row.checkout, id).has(newRoomId)) {
      setError("Camera aleasă este ocupată în intervalul acestei camere.");
      return;
    }
    const newCap = core.rooms.find((x) => x.id === newRoomId)?.capacity || 20;
    const occ = (row.adults ?? 2) + (row.children ?? 0);
    if (occ > newCap) {
      setError(`Ocuparea actuală (${occ}) depășește capacitatea camerei alese (${newCap}).`);
      return;
    }
    const from = core.rooms.find((x) => x.id === row.roomId)?.name;
    const to = core.rooms.find((x) => x.id === newRoomId)?.name;
    await patchRow(id, { roomId: newRoomId });
    await audit.push("Cameră schimbată în grup", `${group.name}: ${from} → ${to}`);
    toaster.show(`Mutat din ${from} în ${to}`, { tone: "ok" });
  };

  const addRoom = async (roomId) => {
    if (!span) { setError("Grupul nu mai are nicio rezervare de la care să preiau datele."); return; }
    const template = rows[0];
    const recordBase = {
      id: uid(), roomId, guestId: group.mainGuestId, groupId: group.id,
      checkin: span.checkin, checkout: span.checkout,
      status: template?.status === "cancelled" ? "confirmed" : (template?.status || "confirmed"),
      notes: "", priceOverride: null, adults: 2, children: 0,
      source: template?.source || "direct", tags: [], messages: [],
    };
    const record = { ...recordBase, bookedPrice: liveReservationTotal(recordBase, core) };
    await updateReservations([...reservations, record]);
    const rn = core.rooms.find((x) => x.id === roomId)?.name;
    await audit.push("Cameră adăugată în grup", `${group.name}: ${rn}`);
    toaster.show(`Camera ${rn} adăugată în grup`, { tone: "ok" });
    setAddOpen(false);
    setError("");
  };

  const dropRoom = async (id) => {
    const row = rows.find((r) => r.id === id);
    const rn = core.rooms.find((x) => x.id === row.roomId)?.name;
    const before = reservations;
    const next = reservations.filter((r) => r.id !== id);
    await updateReservations(next);
    await audit.push("Cameră scoasă din grup", `${group.name}: ${rn}`);
    toaster.show(`Camera ${rn} scoasă din grup`, {
      tone: "danger",
      onUndo: async () => { await updateReservations(before); },
    });
    if (!next.some((r) => r.groupId === group.id)) {
      await updateGroups(groups.filter((g) => g.id !== group.id));
      onClose();
    }
  };

  const renameGroup = async (name) => {
    await updateGroups(groups.map((g) => (g.id === group.id ? { ...g, name } : g)));
  };

  return (
    <Dialog onClose={onClose} title={`Grup: ${group.name}`}>
      <label className="field">
        <span className="fl">Nume grup</span>
        <input value={group.name} onChange={(e) => renameGroup(e.target.value)} />
      </label>

      <div className="group-summary">
        <div><strong>{rows.length}</strong> camere</div>
        <div><strong>{totalGuests}</strong> persoane</div>
        <div><strong>{minN === maxN ? minN : `${minN}–${maxN}`}</strong> nopți</div>
        <div><strong>{namedRooms}</strong>/{rows.length} cu ocupant</div>
        <div><strong>{fmtMoney(totalValue)}</strong></div>
      </div>

      {span && (
        <div className="grp-period">
          <div className="grp-period-head">Perioadă pentru tot grupul</div>
          <div className="grp-dates">
            <label className="grp-num">
              <span>Sosire</span>
              <input type="datetime-local" value={toLocalInputValue(span.checkin)}
                onChange={(e) => shiftAll(e.target.value, null)} />
            </label>
            <label className="grp-num">
              <span>Plecare</span>
              <input type="datetime-local" value={toLocalInputValue(span.checkout)}
                onChange={(e) => shiftAll(null, e.target.value)} />
            </label>
            <div className="grp-nights">
              <span>{nightsBetween(span.checkin, span.checkout)}</span>
              nopți
            </div>
          </div>
          <p className="grp-period-hint">
            Schimbarea aici mută toate camerele. Fiecare cameră poate fi ajustată separat mai jos.
          </p>
        </div>
      )}

      {span && (
        <div className="note" style={{ marginBottom: 12 }}>
          Interval grup: {fmtDate(span.checkin)} → {fmtDate(span.checkout)}. Fiecare cameră poate avea propriile
          date — camerele adăugate pornesc de la intervalul grupului și pot fi ajustate individual.
        </div>
      )}

      {error && <div className="drag-error" role="alert" style={{ marginBottom: 10 }}>{error}</div>}

      <div className="grp-rows">
        {rows.map((r) => {
          return (
            <div className="grp-row" key={r.id}>
              <div className="grp-row-head">
                <select
                  value={r.roomId}
                  onChange={(e) => moveRow(r.id, e.target.value)}
                  aria-label="Schimbă camera"
                >
                  <option value={r.roomId}>
                    {core.rooms.find((x) => x.id === r.roomId)?.name} — {ROOM_TYPE[core.rooms.find((x) => x.id === r.roomId)?.type]?.label}
                  </option>
                  {freeRooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name} — {ROOM_TYPE[room.type]?.label}
                    </option>
                  ))}
                </select>
                <button className="icon-btn" onClick={() => dropRoom(r.id)}
                  aria-label="Scoate camera din grup" title="Scoate camera din grup">
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="grp-dates">
                <label className="grp-num">
                  <span>Sosire</span>
                  <input type="datetime-local" value={toLocalInputValue(r.checkin)}
                    onChange={(e) => changeDates(r.id, e.target.value, null)} />
                </label>
                <label className="grp-num">
                  <span>Plecare</span>
                  <input type="datetime-local" value={toLocalInputValue(r.checkout)}
                    onChange={(e) => changeDates(r.id, null, e.target.value)} />
                </label>
                <div className="grp-nights">
                  <span>{nightsBetween(r.checkin, r.checkout)}</span>
                  nopți
                </div>
              </div>

              <div className="grp-row-body">
                {(() => {
                  const roomCap = core.rooms.find((x) => x.id === r.roomId)?.capacity || 20;
                  return (
                    <>
                      <label className="grp-num">
                        <span>Adulți</span>
                        <input type="number" min="1" max={roomCap} value={r.adults ?? 2}
                          onChange={(e) => patchRow(r.id, { adults: clampOccupant(e.target.value, r.children ?? 0, roomCap, 1) })} />
                      </label>
                      <label className="grp-num">
                        <span>Copii</span>
                        <input type="number" min="0" max={roomCap} value={r.children ?? 0}
                          onChange={(e) => patchRow(r.id, { children: clampOccupant(e.target.value, r.adults ?? 2, roomCap, 0) })} />
                      </label>
                    </>
                  );
                })()}
                <div className="grp-price">{fmtMoney(reservationTotal(r, core))}</div>
              </div>

              {(() => {
                const [legacyLast, ...legacyRest] = (r.occupantName || "").trim().split(" ");
                const lastVal = r.occupantLastName ?? legacyLast ?? "";
                const firstVal = r.occupantFirstName ?? legacyRest.join(" ");
                const phoneVal = r.occupantPhone ?? "";
                const complete = lastVal.trim() && firstVal.trim() && phoneVal.trim();
                return (
                  <div className="grp-occupant">
                    <div className="grp-occupant-head">
                      <span>Ocupant cameră</span>
                      {!complete && <span className="grp-occupant-required">Nume, prenume și telefon obligatorii</span>}
                    </div>
                    <div className="grp-occupant-row">
                      <input
                        className={!lastVal.trim() ? "input-error" : ""}
                        value={lastVal}
                        placeholder="Nume *"
                        aria-label="Numele ocupantului"
                        onChange={(e) => patchOccupant(r.id, { occupantLastName: e.target.value })}
                      />
                      <input
                        className={!firstVal.trim() ? "input-error" : ""}
                        value={firstVal}
                        placeholder="Prenume *"
                        aria-label="Prenumele ocupantului"
                        onChange={(e) => patchOccupant(r.id, { occupantFirstName: e.target.value })}
                      />
                      <input
                        className={!phoneVal.trim() ? "input-error" : ""}
                        value={phoneVal}
                        type="tel"
                        placeholder="Telefon *"
                        aria-label="Telefonul ocupantului"
                        onChange={(e) => patchOccupant(r.id, { occupantPhone: e.target.value })}
                        onBlur={() => {
                          if (lastVal.trim() && firstVal.trim() && phoneVal.trim()) {
                            audit.push("Ocupant setat",
                              `${group.name} · ${core.rooms.find((x) => x.id === r.roomId)?.name}: ${lastVal.trim()} ${firstVal.trim()}`);
                          }
                        }}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {addOpen ? (
        <div className="subform">
          <div className="subform-head">
            Adaugă cameră
            <button className="link-btn" onClick={() => setAddOpen(false)}>Renunță</button>
          </div>
          {freeRooms.length === 0 ? (
            <p style={{ fontSize: "var(--fs-base)", color: "var(--text-muted)", margin: "0 0 12px" }}>
              Nicio cameră liberă în intervalul grupului.
            </p>
          ) : (
            <div className="room-chips" style={{ marginBottom: 12 }}>
              {freeRooms.map((room) => (
                <button className="room-chip" key={room.id} onClick={() => addRoom(room.id)}>
                  {room.name}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button className="btn btn-ghost" style={{ width: "100%", marginTop: 4 }} onClick={() => setAddOpen(true)}>
          <Plus size={15} /> Adaugă cameră în grup
        </button>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onPrint}>
          <Printer size={15} /> Listă cazare
        </button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={onClose}>
          <Check size={15} /> Gata
        </button>
      </div>

    </Dialog>
  );
}

function AutomationView({ core, reservations }) {
  const triggers = useMemo(() => computeTriggers(core, reservations, 72), [core, reservations]);
  return (
    <div>
      <div className="note">
        Această pagină arată doar starea programărilor. Comenzile efective către boiler, AC și ventilație sunt
        trimise de workflow-ul n8n către Home Assistant, pe baza ID-urilor de dispozitiv setate în Configurare camere —
        nu din acest ecran.
      </div>
      <div className="panel">
        {triggers.length === 0 ? (
          <div className="empty-state">
            <Zap size={26} />
            <h4>Nimic programat</h4>
            <p>Nicio sosire în următoarele 72h.</p>
          </div>
        ) : (
          triggers.map((t) => {
            const lbl = triggerLabel(t.diffMin);
            return (
              <div className="list-row" key={t.reservation.id}>
                <div>
                  <div className="primary">{t.room.name}</div>
                  <div className="secondary">Check-in {fmtDateTime(t.checkin)} · declanșare {fmtDateTime(t.trigger)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--text-muted)" }}>
                    <Flame size={13} /><Wind size={13} /><Snowflake size={13} />
                  </span>
                  <span className={"role-tag " + (lbl.cls === "done" ? "role-housekeeping" : lbl.cls === "soon" ? "role-admin" : "role-receptionist")}>
                    {lbl.text}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   CALENDAR VIEW
----------------------------------------------------------------*/
function CalendarView({ core, updateCore, reservations, updateReservations, groups, updateGroups, housekeeping, updateHousekeeping, blocks, updateBlocks, intent, clearIntent }) {
  const [offset, setOffset] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dense, setDense] = useState(false);
  const [actionRes, setActionRes] = useState(null);
  const [blockInfo, setBlockInfo] = useState(null);
  const [moveId, setMoveId] = useState(null);
  const [dragError, setDragError] = useState("");
  const DAYS = 14;
  const [modal, setModal] = useState(null); // { reservation | null, defaultRoomId, defaultDate }

  const days = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() + offset);
    return Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i); return d;
    });
  }, [offset]);

  const rangeStart = days[0], rangeEnd = new Date(days[DAYS - 1].getTime() + 86400000);

  const moveReservation = async (resId, targetRoomId, targetDay) => {
    const res = reservations.find((r) => r.id === resId);
    if (!res) return;
    const nights = nightsBetween(res.checkin, res.checkout);
    const oldCi = new Date(res.checkin), oldCo = new Date(res.checkout);
    const newCi = new Date(targetDay);
    newCi.setHours(oldCi.getHours(), oldCi.getMinutes(), 0, 0);
    const newCo = new Date(newCi);
    newCo.setDate(newCi.getDate() + nights);
    newCo.setHours(oldCo.getHours(), oldCo.getMinutes(), 0, 0);

    // Across a DST boundary the wall-clock arithmetic above can land a day off.
    // Correct it so the stay always keeps exactly the same number of nights.
    const drift = nights - nightsBetween(newCi, newCo);
    if (drift !== 0) newCo.setDate(newCo.getDate() + drift);

    if (targetRoomId === res.roomId && newCi.getTime() === oldCi.getTime()) return;

    const clash = reservations.some((r) =>
      r.id !== resId && r.roomId === targetRoomId && isLive(r) &&
      newCi < new Date(r.checkout) && newCo > new Date(r.checkin))
      || (blocks || []).some((b) =>
        b.roomId === targetRoomId && newCi < new Date(b.end) && newCo > new Date(b.start));
    if (clash) {
      const rn = core.rooms.find((r) => r.id === targetRoomId)?.name;
      setDragError(`Camera ${rn} e ocupată în intervalul ales.`);
      setTimeout(() => setDragError(""), 3500);
      return;
    }

    await updateReservations(reservations.map((r) => r.id === resId
      ? { ...r, roomId: targetRoomId, checkin: newCi.toISOString(), checkout: newCo.toISOString() }
      : r));

    const fromRoom = core.rooms.find((r) => r.id === res.roomId)?.name;
    const toRoom = core.rooms.find((r) => r.id === targetRoomId)?.name;
    const who = guestFullName(core.guests.find((g) => g.id === res.guestId)) || "Fără nume";
    await audit.push("Rezervare mutată",
      `${who}: ${fromRoom} ${fmtDate(oldCi)} → ${toRoom} ${fmtDate(newCi)}`);
  };

  useEffect(() => {
    if (intent === "group") {
      setModal({ reservation: null, mode: "group" });
      clearIntent();
    }
  }, [intent, clearIntent]);

  const jumpTo = (target) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    setOffset(Math.round((target - today) / 86400000));
    setPickerOpen(false);
  };

  useEffect(() => {
    if (!pickerOpen) return;
    const close = () => setPickerOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [pickerOpen]);

  /* Parse every date string once per data change instead of re-parsing it
     inside each per-room, per-day comparison below, and bucket by room so
     the calendar walks the reservation list once in total rather than once
     for each of the 16 rooms. */
  const resByRoom = useMemo(() => {
    const map = new Map();
    for (const r of reservations) {
      if (!isLive(r)) continue;
      const ciMs = new Date(r.checkin).getTime();
      const coMs = new Date(r.checkout).getTime();
      if (!Number.isFinite(ciMs) || !Number.isFinite(coMs)) continue;
      // Day-level boundaries too: occupancy is counted in room-nights, and
      // the night of day D belongs to a stay only when ciDay <= D < coDay.
      const ciDay = new Date(ciMs); ciDay.setHours(0, 0, 0, 0);
      const coDay = new Date(coMs); coDay.setHours(0, 0, 0, 0);
      let bucket = map.get(r.roomId);
      if (!bucket) { bucket = []; map.set(r.roomId, bucket); }
      bucket.push({ res: r, ciMs, coMs, ciDayMs: ciDay.getTime(), coDayMs: coDay.getTime() });
    }
    return map;
  }, [reservations]);

  const blocksByRoom = useMemo(() => {
    const map = new Map();
    for (const b of blocks || []) {
      const sMs = new Date(b.start).getTime();
      const eMs = new Date(b.end).getTime();
      if (!Number.isFinite(sMs) || !Number.isFinite(eMs)) continue;
      let bucket = map.get(b.roomId);
      if (!bucket) { bucket = []; map.set(b.roomId, bucket); }
      bucket.push({ block: b, sMs, eMs });
    }
    return map;
  }, [blocks]);

  /* Day boundaries as plain numbers, computed once per date range. */
  const dayMs = useMemo(() => days.map((d) => d.getTime()), [days]);

  /* Occupancy is the number of rooms sold for that night. A stay occupies
     the night of day D only while ciDay <= D < coDay — the departure day
     itself is not a sold night, so a same-day turnover counts once (the
     arriving guest), not twice as it did when any overlap with the
     calendar day was treated as occupancy. */
  const dailyOccupancy = useMemo(() => {
    const stays = [];
    for (const bucket of resByRoom.values()) {
      for (const e of bucket) stays.push(e);
    }
    return dayMs.map((dStart) => {
      let occ = 0;
      for (const e of stays) if (e.ciDayMs <= dStart && e.coDayMs > dStart) occ++;
      return { occ, pct: core.rooms.length ? Math.round((occ / core.rooms.length) * 100) : 0 };
    });
  }, [dayMs, resByRoom, core.rooms.length]);

  const rangeStartMs = rangeStart.getTime(), rangeEndMs = rangeEnd.getTime();

  const spanIndices = (startMs, endMs) => {
    let startIdx = -1, endIdx = -1;
    for (let i = 0; i < dayMs.length; i++) {
      const dStart = dayMs[i], dEnd = dStart + 86400000;
      if (startMs < dEnd && endMs > dStart) {
        if (startIdx === -1) startIdx = i;
        endIdx = i;
      }
    }
    return { startIdx, endIdx };
  };

  const spansForRoomRaw = (roomId) =>
    (resByRoom.get(roomId) || [])
      .filter((e) => e.coMs > rangeStartMs && e.ciMs < rangeEndMs)
      .map(({ res: r, ciMs, coMs }) => {
        const { startIdx, endIdx } = spanIndices(ciMs, coMs);
        if (startIdx === -1) return null;
        const ciDay = new Date(ciMs); ciDay.setHours(0, 0, 0, 0);
        const coDay = new Date(coMs); coDay.setHours(0, 0, 0, 0);
        return {
          res: r, startIdx, endIdx, len: endIdx - startIdx + 1,
          nights: Math.max(1, Math.round((coDay - ciDay) / 86400000)),
          clipStart: ciMs < rangeStartMs,
          clipEnd: coMs > rangeEndMs,
        };
      })
      .filter(Boolean);

  const blockSpansForRoomRaw = (roomId) =>
    (blocksByRoom.get(roomId) || [])
      .filter((e) => e.eMs > rangeStartMs && e.sMs < rangeEndMs)
      .map(({ block: b, sMs, eMs }) => {
        const { startIdx, endIdx } = spanIndices(sMs, eMs);
        if (startIdx === -1) return null;
        return { block: b, startIdx, endIdx, len: endIdx - startIdx + 1 };
      })
      .filter(Boolean);

  const rowSpans = useMemo(() => {
    const map = {};
    core.rooms.forEach((room) => {
      map[room.id] = { res: spansForRoomRaw(room.id), blocks: blockSpansForRoomRaw(room.id) };
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [core.rooms, resByRoom, blocksByRoom, dayMs]);


  return (
    <div className="cal-view">
      <div className="toolbar cal-toolbar">
        <div className="week-nav">
          <button onClick={() => setOffset((o) => o - DAYS)} aria-label="Cele 14 zile anterioare">
            <ChevronLeft size={15} />
            <span>14 zile</span>
          </button>
          <div className="jump-wrap">
            <button className={offset === 0 ? "on" : ""} onClick={(e) => { e.stopPropagation(); setPickerOpen((v) => !v); }}>
              <CalendarDays size={14} />
              <span>{offset === 0 ? "Azi" : fmtDate(days[0])}</span>
            </button>
            {pickerOpen && (
              <div className="jump-pop" onClick={(e) => e.stopPropagation()}>
                <label>Sari la data</label>
                <input
                  type="date"
                  autoFocus
                  value={toDateInput(days[0])}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    jumpTo(new Date(e.target.value + "T00:00:00"));
                  }}
                />
                <button className="btn btn-ghost" style={{ width: "100%" }} onClick={() => { setOffset(0); setPickerOpen(false); }}>
                  Înapoi la azi
                </button>
              </div>
            )}
          </div>
          <button onClick={() => setOffset((o) => o + DAYS)} aria-label="Următoarele 14 zile">
            <span>14 zile</span>
            <ChevronRight size={15} />
          </button>
        </div>
        <div className="grow" />
        <button
          className={"icon-btn" + (dense ? " active" : "")}
          onClick={() => setDense((v) => !v)}
          aria-pressed={dense}
          title={dense ? "Vedere confortabilă" : "Vedere compactă"}
          aria-label={dense ? "Treci la vedere confortabilă" : "Treci la vedere compactă"}
        >
          {dense ? <Rows3 size={16} /> : <Rows2 size={16} />}
        </button>
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setModal({ reservation: null })}>
          <Plus size={15} />
          <span className="lbl-long">Rezervare nouă</span>
          <span className="lbl-short">Rezervare</span>
        </button>
      </div>

      {dragError && <div className="drag-error" role="alert">{dragError}</div>}
      {moveId ? (
        <div className="move-banner" role="status">
          <MoveRight size={15} />
          <span>Atinge celula unde muți rezervarea — camera și ziua de sosire.</span>
          <button className="btn btn-ghost" style={{ padding: "6px 12px" }} onClick={() => setMoveId(null)}>Renunță</button>
        </div>
      ) : null}

      <div className={"cal-scroll" + (dense ? " dense" : "")}>
        <div className="cal-grid" style={{ "--days": DAYS }}>
          <div className="cal-row cal-head">
            <div className="cal-roomcell" style={{ fontWeight: 700, fontSize: 12 }}>Cameră</div>
            {days.map((d, i) => {
              const wk = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div key={i} className={"cal-daycell" + (isToday(d) ? " today" : wk ? " weekend" : "")}>
                  {FMT_WEEKDAY.format(d)}<br />{fmtDate(d)}
                </div>
              );
            })}
          </div>

          {core.rooms.map((room, roomIdx) => {
            const spans = rowSpans[room.id]?.res || [];
            const bSpans = rowSpans[room.id]?.blocks || [];
            // Rooms are listed grouped by type; mark where one type ends and
            // the next begins so tiny houses and lofts read as separate blocks.
            const prevType = roomIdx > 0 ? core.rooms[roomIdx - 1].type : null;
            const startsNewType = room.type !== prevType;
            return (
              <React.Fragment key={room.id}>
                {startsNewType && (
                  <div className="cal-typerow" aria-hidden="true">
                    <div className="cal-typelabel">{ROOM_TYPE[room.type]?.label || room.type}</div>
                  </div>
                )}
              <div className="cal-row">
                <div className="cal-roomcell">
                  <div className="rname">{room.name}</div>
                  <div className="rfloor">
                    {ROOM_TYPE[room.type]?.short || ""}
                    {room.capacity > 2 && <span className="room-cap-plus"> +</span>}
                  </div>
                </div>
                {days.map((d, i) => {
                  const span = spans.find((sp) => sp.startIdx === i);
                  const covered = spans.find((sp) => i >= sp.startIdx && i <= sp.endIdx);
                  const bSpan = bSpans.find((sp) => sp.startIdx === i);
                  const bCovered = bSpans.find((sp) => i >= sp.startIdx && i <= sp.endIdx);
                  // Reservation bars start/end at the midpoint of the checkin/checkout
                  // day cell, so a same-day turnover shows both the departing and the
                  // arriving stay side by side instead of one full cell hiding the other.
                  // Computed straight from the reservation's own checkin/checkout dates
                  // (not from span.len) since len counts the checkout day as fully
                  // occupied whenever checkout isn't exactly midnight — using it here
                  // pushed the bar a whole extra cell too far, overlapping the next stay.
                  // Clipped ends (stay continues outside the visible date range) stay
                  // flush with the cell edge instead of stopping at a midpoint.
                  let barLeft = "3px";
                  let barWidthUnits = 0;
                  if (span) {
                    const ciIdx = Math.floor((new Date(span.res.checkin) - rangeStart) / 86400000);
                    const coIdx = Math.floor((new Date(span.res.checkout) - rangeStart) / 86400000);
                    const leftAbs = span.clipStart ? span.startIdx : ciIdx + 0.5;
                    const rightAbs = span.clipEnd ? days.length : coIdx + 0.5;
                    barLeft = span.clipStart ? "3px" : "calc(50% + 3px)";
                    barWidthUnits = rightAbs - leftAbs;
                  }
                  return (
                    <div
                      key={i}
                      className={"cal-cell"
                        + (d.getDay() === 0 || d.getDay() === 6 ? " weekend" : "")
                        + (moveId ? " movable" : "")}
                      onClick={() => {
                        if (moveId) { moveReservation(moveId, room.id, d); setMoveId(null); return; }
                        if (bCovered) { setBlockInfo(bCovered.block); return; }
                        if (covered) setActionRes(covered.res);
                        else setModal({ reservation: null, defaultRoomId: room.id, defaultDate: d });
                      }}
                    >
                      {bSpan && (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); setBlockInfo(bSpan.block); }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setBlockInfo(bSpan.block); }
                          }}
                          className="cal-bar block-bar"
                          style={{ width: `calc(${bSpan.len} * 100% - 6px)` }}
                          title={`Blocat: ${bSpan.block.reason}`}
                        >
                          <Wrench size={11} style={{ flexShrink: 0 }} />
                          <span className="bar-name">{bSpan.block.reason}</span>
                        </div>
                      )}

                      {span && (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); if (moveId) return; setActionRes(span.res); }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActionRes(span.res); }
                          }}
                          className={"cal-bar " + STATUS_CLASS[span.res.status] +
                            (span.clipStart ? " clip-start" : "") + (span.clipEnd ? " clip-end" : "") +
                            (moveId === span.res.id ? " moving" : "")}
                          style={{ left: barLeft, width: `calc(${barWidthUnits} * 100% - 6px)` }}
                          title={`${occupantName(span.res, core, groups) || "Fără nume"} · ${fmtDateTime(span.res.checkin)} → ${fmtDateTime(span.res.checkout)} · ${STATUS_LABEL[span.res.status]}`}
                        >
                          <span className="bar-glyph" aria-hidden="true">{STATUS_GLYPH[span.res.status]}</span>
                          {span.res.groupId && <UsersRound size={11} style={{ flexShrink: 0, opacity: .8 }} />}
                          <span className="bar-name">
                            {occupantName(span.res, core, groups) || "Fără nume"}
                          </span>
                          {span.res.tags?.includes("VIP") && <span className="bar-vip">VIP</span>}
                          {span.res.messages?.length > 0 && <MessageSquare size={10} style={{ flexShrink: 0, opacity: .75 }} />}
                          {span.nights > 2 && <span className="bar-nights">{span.nights}n</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              </React.Fragment>
            );
          })}

          <div className="cal-row cal-foot">
            <div className="cal-roomcell">
              <div className="rname" style={{ fontSize: 11, fontFamily: "inherit", fontWeight: 700 }}>Ocupare</div>
            </div>
            {days.map((d, i) => {
              const { occ, pct } = dailyOccupancy[i];
              return (
                <div key={i} className={"cal-occ" + (isToday(d) ? " today" : "")}
                  title={`${occ} din ${core.rooms.length} camere ocupate`}>
                  <div className="occ-num mono">{occ}</div>
                  <div className="occ-pct">{pct}%</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {blockInfo && (
        <Dialog onClose={() => setBlockInfo(null)} className="action-modal" title={undefined}>
            <div className="action-head">
              <div>
                <div className="action-guest">{blockInfo.reason}</div>
                <div className="action-meta">
                  <span className="mono">{core.rooms.find((r) => r.id === blockInfo.roomId)?.name}</span>
                  {" · "}{fmtDate(blockInfo.start)} → {fmtDate(blockInfo.end)}
                </div>
              </div>
              <span className="role-tag role-receptionist">Blocaj</span>
            </div>
            <div className="action-list">
              <button className="action-item danger" onClick={async () => {
                const before = blocks || [];
                await updateBlocks(before.filter((b) => b.id !== blockInfo.id));
                await audit.push("Blocaj eliminat",
                  `${core.rooms.find((r) => r.id === blockInfo.roomId)?.name} · ${blockInfo.reason}`);
                toaster.show("Blocajul a fost eliminat", {
                  tone: "danger",
                  onUndo: async () => { await updateBlocks(before); },
                });
                setBlockInfo(null);
              }}>
                <span className="ai-ico"><Trash2 size={17} /></span>
                <span className="ai-body"><span className="ai-t">Elimină blocajul</span>
                  <span className="ai-d">Camera redevine disponibilă</span></span>
              </button>
            </div>
            <button className="btn btn-ghost" style={{ width: "100%", marginTop: 6 }} onClick={() => setBlockInfo(null)}>Închide</button>
          </Dialog>
      )}

      <div className="cal-legend">
        {Object.entries(STATUS_LABEL).map(([k, v]) => (
          <span className="legend-item" key={k}>
            <span className={"legend-chip " + STATUS_CLASS[k]}>{STATUS_GLYPH[k]}</span>{v}
          </span>
        ))}
        <span className="legend-item">
          <span className="legend-chip block-bar"><Wrench size={9} /></span>Blocaj
        </span>
      </div>

      {actionRes && (
        <ReservationActions
          res={actionRes}
          core={core}
          groups={groups}
          reservations={reservations}
          updateReservations={updateReservations}
          housekeeping={housekeeping}
          updateHousekeeping={updateHousekeeping}
          onOpen={() => { setModal({ reservation: actionRes }); setActionRes(null); }}
          onMove={() => { setMoveId(actionRes.id); setActionRes(null); setDragError(""); }}
          onClose={() => setActionRes(null)}
        />
      )}

      {modal && (
        <ReservationModal
          data={modal}
          core={core}
          updateCore={updateCore}
          reservations={reservations}
          updateReservations={updateReservations}
          groups={groups}
          updateGroups={updateGroups}
          blocks={blocks}
          updateBlocks={updateBlocks}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function ReservationModal({ data, core, updateCore, reservations, updateReservations, groups, updateGroups, blocks, updateBlocks, onClose }) {
  useModalLock();
  const editing = data.reservation;
  const [mode, setMode] = useState(data.mode || "single");
  const [roomId, setRoomId] = useState(editing?.roomId || data.defaultRoomId || core.rooms[0]?.id || "");
  const [roomIds, setRoomIds] = useState(data.defaultRoomId ? [data.defaultRoomId] : []);
  const [groupName, setGroupName] = useState("");
  const [guestId, setGuestId] = useState(editing?.guestId || "");
  const [guestQuery, setGuestQuery] = useState("");
  const [guestFormSeed, setGuestFormSeed] = useState(null);
  const [checkin, setCheckin] = useState(
    editing ? toLocalInputValue(editing.checkin) :
    (() => { const d = data.defaultDate ? new Date(data.defaultDate) : new Date(); d.setHours(15, 0, 0, 0); return toLocalInputValue(d.toISOString()); })()
  );
  const [checkout, setCheckout] = useState(
    editing ? toLocalInputValue(editing.checkout) :
    (() => { const d = data.defaultDate ? new Date(data.defaultDate) : new Date(); d.setDate(d.getDate() + 1); d.setHours(11, 0, 0, 0); return toLocalInputValue(d.toISOString()); })()
  );
  const [status, setStatus] = useState(editing?.status || "confirmed");
  const [priceOverride, setPriceOverride] = useState(editing?.priceOverride ?? "");
  const [adults, setAdults] = useState(editing?.adults ?? 2);
  const [children, setChildren] = useState(editing?.children ?? 0);
  const [source, setSource] = useState(editing?.source || "direct");
  const [tags, setTags] = useState(editing?.tags || []);
  const [newTag, setNewTag] = useState("");
  const [newTagOpen, setNewTagOpen] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [showArrival, setShowArrival] = useState(false);
  const [notes, setNotes] = useState(editing?.notes || "");
  const [error, setError] = useState("");
  const guests = core.guests;

  const isGroup = !editing && mode === "group";
  const isBlock = !editing && mode === "block";
  /* Cat timp e grup, adultii/copiii se aplica identic pe fiecare camera
     selectata — capacitatea folosita e cea mai mica dintre camerele alese,
     ca nicio camera sa nu ramana peste propria capacitate. */
  const maxOccupancy = isGroup
    ? (roomIds.length ? Math.min(...roomIds.map((id) => core.rooms.find((r) => r.id === id)?.capacity || 20)) : 20)
    : (core.rooms.find((r) => r.id === roomId)?.capacity || 20);
  /* Daca nimic ce afecteaza pretul (camera/data/ocupare) nu s-a schimbat
     fata de rezervarea existenta, previzualizarea si salvarea folosesc
     pretul deja inghetat, nu un recalcul cu tarifele curente. */
  const priceAffectingChanged = !editing
    || editing.roomId !== roomId
    || new Date(editing.checkin).getTime() !== new Date(checkin).getTime()
    || new Date(editing.checkout).getTime() !== new Date(checkout).getTime()
    || (editing.adults ?? 2) !== (Number(adults) || 1)
    || (editing.children ?? 0) !== (Number(children) || 0);
  const editingGroup = editing?.groupId ? groups.find((g) => g.id === editing.groupId) : null;
  const selectedGuest = guests.find((g) => g.id === guestId) || null;
  const matchingGuests = (() => {
    const t = guestQuery.trim().toLowerCase();
    if (!t) return [];
    return guests.filter((g) =>
      guestFullName(g).toLowerCase().includes(t) ||
      (g.phone || "").replace(/\s/g, "").includes(t.replace(/\s/g, "")) ||
      (g.city || "").toLowerCase().includes(t)
    );
  })();

  const startAddGuest = () => {
    const parts = guestQuery.trim().split(/\s+/);
    setGuestFormSeed({ ...emptyGuest(), lastName: parts[0] || "", firstName: parts.slice(1).join(" ") });
    setError("");
  };

  const saveNewGuest = async (guest) => {
    await updateCore({ ...core, guests: [...core.guests, guest] });
    await audit.push("Client adăugat", guestFullName(guest));
    setGuestId(guest.id);
    setGuestQuery("");
    setGuestFormSeed(null);
  };

  /* A tag typed here joins the shared list, so it is reusable next time. */
  const commitNewTag = async () => {
    const t = newTag.trim();
    if (!t) { setNewTagOpen(false); return; }
    const list = core.tags || DEFAULT_TAGS;
    if (!list.some((x) => x.toLowerCase() === t.toLowerCase())) {
      await updateCore({ ...core, tags: [...list, t] });
      await audit.push("Etichetă adăugată", t);
    }
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setNewTag(""); setNewTagOpen(false);
  };

  const previewTotal = (() => {
    if (priceOverride !== "") {
      return Math.max(0, Number(priceOverride) || 0);
    }
    if (!isGroup && editing && !priceAffectingChanged && editing.bookedPrice != null) {
      return Number(editing.bookedPrice) || 0;
    }
    const ids = isGroup ? roomIds : [roomId];
    return ids.reduce((sum, rid) =>
      sum + reservationTotal({ roomId: rid, checkin, checkout, adults, children }, core), 0);
  })();

  /* One pass over reservations and blocks per date change, rather than a
     scan per room on every render of the form. */
  const busyRooms = useMemo(() => {
    const ci = new Date(checkin), co = new Date(checkout);
    const set = new Set();
    if (isNaN(ci.getTime()) || isNaN(co.getTime())) return set;
    for (const r of reservations) {
      if (!isLive(r) || r.id === editing?.id) continue;
      if (ci < new Date(r.checkout) && co > new Date(r.checkin)) set.add(r.roomId);
    }
    for (const b of blocks || []) {
      if (ci < new Date(b.end) && co > new Date(b.start)) set.add(b.roomId);
    }
    return set;
  }, [checkin, checkout, reservations, blocks, editing?.id]);

  const conflictsFor = (ids) => ids.filter((rid) => busyRooms.has(rid));

  const save = async () => {
    if (isBlock) {
      if (roomIds.length < 1) { setError("Selectează cel puțin o cameră de blocat."); return; }
      const dv = validateStay(checkin, checkout);
      if (dv) { setError(dv.replace("check-in", "început").replace("check-out", "sfârșit")); return; }
      const busy = conflictsFor(roomIds);
      if (busy.length) {
        const names = busy.map((id) => core.rooms.find((r) => r.id === id)?.name).join(", ");
        setError(`Ocupate în acest interval: ${names}`); return;
      }
      const newBlocks = roomIds.map((rid) => ({
        id: uid(), roomId: rid,
        start: new Date(checkin).toISOString(), end: new Date(checkout).toISOString(),
        reason: blockReason.trim() || "Mentenanță", createdAt: new Date().toISOString(),
      }));
      await updateBlocks([...(blocks || []), ...newBlocks]);
      await audit.push("Camere blocate",
        `${roomIds.map((id) => core.rooms.find((r) => r.id === id)?.name).join(", ")} · ${fmtDate(checkin)} → ${fmtDate(checkout)} · ${blockReason.trim() || "Mentenanță"}`);
      onClose();
      return;
    }

    if (!guestId) {
      setError(isGroup ? "Alege clientul principal al grupului." : "Caută și alege un client, sau adaugă unul nou.");
      return;
    }
    const dateErr = validateStay(checkin, checkout);
    if (dateErr) { setError(dateErr); return; }
    const priceErr = validatePrice(priceOverride);
    if (priceErr) { setError(priceErr); return; }
    if (!Number.isFinite(Number(adults)) || Number(adults) < 1) { setError("Numărul de adulți trebuie să fie cel puțin 1."); return; }
    if (!Number.isFinite(Number(children)) || Number(children) < 0) { setError("Numărul de copii nu poate fi negativ."); return; }
    /* Adulti/copii se clampeaza reactiv doar cand se modifica direct acele
       campuri — schimbarea camerei (sau a camerelor de grup) dupa aceea nu
       le reajusteaza, asa ca ocuparea trebuie reverificata explicit aici. */
    if (Number(adults) + Number(children) > maxOccupancy) {
      setError(`Ocuparea aleasă (${Number(adults) + Number(children)}) depășește capacitatea ${isGroup ? "camerelor selectate" : "camerei selectate"} (${maxOccupancy}).`);
      return;
    }

    /* The status dropdown could otherwise set "checkedin" on any date,
       going around the same-day rule the buttons enforce. Only block the
       transition into checked-in — a stay already checked in stays valid. */
    if (status === "checkedin" && editing?.status !== "checkedin"
      && !isSameDay(checkin, new Date())) {
      setError("Check-in-ul se poate face doar în ziua sosirii.");
      return;
    }

    if (isGroup) {
      if (roomIds.length < 1) { setError("Selectează cel puțin o cameră pentru grup."); return; }
      if (!groupName.trim()) { setError("Dă un nume grupului."); return; }
      const busy = conflictsFor(roomIds);
      if (busy.length) {
        const names = busy.map((id) => core.rooms.find((r) => r.id === id)?.name).join(", ");
        setError(`Ocupate în acest interval: ${names}`); return;
      }
      const groupId = uid();
      const group = {
        id: groupId, name: groupName.trim(), mainGuestId: guestId,
        createdAt: new Date().toISOString(), notes,
      };
      // A manual price on a group is the TOTAL for the whole stay, so it's
      // split evenly across rooms rather than copied onto each one — a
      // leftover lei from integer division goes to the first rooms so the
      // per-room amounts still sum exactly to what was typed.
      const groupTotal = priceOverride === "" ? null : Math.max(0, Number(priceOverride) || 0);
      const baseShare = groupTotal != null ? Math.floor(groupTotal / roomIds.length) : null;
      const remainder = groupTotal != null ? groupTotal - baseShare * roomIds.length : 0;
      const newRes = roomIds.map((rid, idx) => {
        const base = {
          id: uid(), roomId: rid, guestId, groupId,
          checkin: new Date(checkin).toISOString(), checkout: new Date(checkout).toISOString(),
          status, notes,
          adults: Number(adults) || 1, children: Number(children) || 0, source,
          tags: [...tags], messages: [],
        };
        return groupTotal == null
          ? { ...base, priceOverride: null, bookedPrice: liveReservationTotal(base, core) }
          : { ...base, priceOverride: baseShare + (idx < remainder ? 1 : 0), bookedPrice: null };
      });
      await updateGroups([...groups, group]);
      await updateReservations([...reservations, ...newRes]);
      await audit.push("Grup creat",
        `${group.name} · ${roomIds.length} camere · ${fmtDate(checkin)} → ${fmtDate(checkout)}`);
      onClose();
      return;
    }

    if (conflictsFor([roomId]).length) { setError("Camera este deja rezervată în acest interval."); return; }

    /* Spread `editing` first so fields this form doesn't expose — the
       per-room occupant name/phone on group rooms above all — survive a
       save instead of being silently dropped by a from-scratch rebuild. */
    const recordBase = {
      ...(editing || {}),
      id: editing?.id || uid(), roomId, guestId, groupId: editing?.groupId || null,
      checkin: new Date(checkin).toISOString(), checkout: new Date(checkout).toISOString(),
      status, notes,
      adults: Number(adults) || 1, children: Number(children) || 0, source, tags: [...tags],
      messages: editing?.messages || [],
    };
    /* Pretul manual e mereu explicit. Cel "auto" ramane inghetat in
       bookedPrice pana cand ceva ce chiar afecteaza pretul se schimba
       (data, camera, ocupare) — un simplu re-salvare (ex. doar o nota
       modificata) sau un tarif schimbat ulterior nu il ating.
       priceAffectingChanged e calculat mai sus, langa previewTotal. */
    const record = priceOverride === ""
      ? {
          ...recordBase, priceOverride: null,
          bookedPrice: priceAffectingChanged || editing?.bookedPrice == null
            ? liveReservationTotal(recordBase, core) : editing.bookedPrice,
        }
      : { ...recordBase, priceOverride: Number(priceOverride), bookedPrice: null };
    const nextRes = editing ? reservations.map((r) => (r.id === editing.id ? record : r)) : [...reservations, record];

    await updateReservations(nextRes);
    const who = guestFullName(core.guests.find((g) => g.id === guestId)) || "Fără nume";
    const rn = core.rooms.find((r) => r.id === roomId)?.name;
    await audit.push(editing ? "Rezervare modificată" : "Rezervare creată",
      `${who} · ${rn} · ${fmtDate(checkin)} → ${fmtDate(checkout)}`);
    toaster.show(editing ? "Rezervare actualizată" : `Rezervare creată · ${rn}`, { tone: "ok" });
    onClose();
  };

  const remove = async () => {
    const nextRes = reservations.filter((r) => r.id !== editing.id);
    await updateReservations(nextRes);

    // A group with no reservations left would linger as an orphan.
    if (editing.groupId && !nextRes.some((r) => r.groupId === editing.groupId)) {
      const g = (groups || []).find((x) => x.id === editing.groupId);
      await updateGroups((groups || []).filter((x) => x.id !== editing.groupId));
      if (g) await audit.push("Grup închis", `${g.name} · nu mai are rezervări`);
    }

    const who = guestFullName(core.guests.find((g) => g.id === editing.guestId)) || "Fără nume";
    const rn = core.rooms.find((r) => r.id === editing.roomId)?.name;
    await audit.push("Rezervare ștearsă", `${who} · ${rn} · ${fmtDate(editing.checkin)}`);
    const beforeRes = reservations, beforeGroups = groups;
    toaster.show(`Rezervarea ${who} · ${rn} a fost ștearsă`, {
      tone: "danger",
      onUndo: async () => {
        await updateReservations(beforeRes);
        await updateGroups(beforeGroups);
        await audit.push("Ștergere anulată", `${who} · ${rn}`);
      },
    });
    onClose();
  };

  return (
    <Dialog
      onClose={onClose}
      title={editing ? "Editează rezervarea" : isGroup ? "Rezervare de grup" : isBlock ? "Blocaj cameră" : "Rezervare nouă"}
    >

        {!editing && (
          <div className="mode-switch">
            <button className={mode === "single" ? "on" : ""} onClick={() => { setMode("single"); setError(""); }}>
              <DoorOpen size={14} /> O cameră
            </button>
            <button className={mode === "group" ? "on" : ""} onClick={() => { setMode("group"); setError(""); }}>
              <UsersRound size={14} /> Grup
            </button>
            <button className={mode === "block" ? "on" : ""} onClick={() => { setMode("block"); setError(""); }}>
              <Wrench size={14} /> Blocaj
            </button>
          </div>
        )}

        {editingGroup && (
          <div className="group-banner">
            <UsersRound size={15} />
            <span>Face parte din grupul <strong>{editingGroup.name}</strong></span>
          </div>
        )}

        {isGroup || isBlock ? (
          <>
            {isGroup && <label className="field">
              <span className="fl">Nume grup *</span>
              <input value={groupName} onChange={(e) => { setGroupName(e.target.value); setError(""); }}
                placeholder="ex. Familia Popescu · Nuntă Ionescu" />
            </label>}

            {isBlock && <label className="field">
              <span className="fl">Motiv</span>
              <input value={blockReason} onChange={(e) => { setBlockReason(e.target.value); setError(""); }}
                placeholder="ex. Zugrăvit · reparație boiler" />
            </label>}
            <div className="field">
              <label>{isBlock ? "Camere blocate" : "Camere"} * ({roomIds.length} selectate)</label>
              <div className="room-picker">
                {["tiny", "loft"].map((t) => {
                  const list = core.rooms.filter((r) => r.type === t);
                  if (!list.length) return null;
                  const freeRooms = list.filter((r) => !busyRooms.has(r.id));
                  const allOn = freeRooms.length > 0 && freeRooms.every((r) => roomIds.includes(r.id));
                  return (
                    <div key={t} className="room-picker-group">
                      <div className="room-picker-head">
                        {ROOM_TYPE[t].label}
                        <button className="link-btn" onClick={() => {
                          const free = freeRooms.map((r) => r.id);
                          setRoomIds((prev) => allOn
                            ? prev.filter((id) => !list.some((r) => r.id === id))
                            : [...new Set([...prev, ...free])]);
                          setError("");
                        }}>{allOn ? "Deselectează" : "Toate libere"}</button>
                      </div>
                      <div className="room-chips">
                        {list.map((r) => {
                          const on = roomIds.includes(r.id);
                          const busy = busyRooms.has(r.id);
                          return (
                            <button
                              key={r.id}
                              className={"room-chip" + (on ? " on" : "") + (busy ? " busy" : "")}
                              title={busy ? "Ocupată sau blocată în acest interval" : ""}
                              onClick={() => {
                                setRoomIds((prev) => on ? prev.filter((id) => id !== r.id) : [...prev, r.id]);
                                setError("");
                              }}
                            >
                              {r.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <label className="field">
            <span className="fl">Cameră</span>
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              {core.rooms.map((r) => {
                const busy = busyRooms.has(r.id);
                return (
                  <option key={r.id} value={r.id} disabled={busy && r.id !== editing?.roomId}>
                    {r.name} — {ROOM_TYPE[r.type]?.label || ""}{busy && r.id !== editing?.roomId ? " · ocupată" : ""}
                  </option>
                );
              })}
            </select>
          </label>
        )}

        {!isBlock && <div className="field">
          <label>{isGroup ? "Client principal *" : "Client *"}</label>
          {selectedGuest ? (
            <div className="guest-chip">
              <div className="guest-chip-av">{initials(guestFullName(selectedGuest))}</div>
              <div className="guest-chip-body">
                <div className="gname">{guestFullName(selectedGuest)}</div>
                <div className="gmeta">{[selectedGuest.phone, selectedGuest.city].filter(Boolean).join(" · ") || "Fără date de contact"}</div>
              </div>
              <button className="icon-btn" onClick={() => { setGuestId(""); setGuestQuery(""); }} aria-label="Schimbă clientul">
                <X size={15} />
              </button>
            </div>
          ) : (
            <div className="guest-search">
              <div className="search-box" style={{ maxWidth: "none", width: "100%" }}>
                <Search size={15} color="var(--text-muted)" />
                <input
                  value={guestQuery}
                  onChange={(e) => { setGuestQuery(e.target.value); setError(""); }}
                  placeholder="Caută după nume, telefon sau oraș"
                />
              </div>
              {guestQuery.trim() && (
                matchingGuests.length > 0 ? (
                  <div className="guest-results">
                    {matchingGuests.slice(0, 6).map((g) => (
                      <button key={g.id} className="guest-result" onClick={() => { setGuestId(g.id); setGuestQuery(""); }}>
                        <div className="guest-chip-av">{initials(guestFullName(g))}</div>
                        <div>
                          <div className="gname">{guestFullName(g)}</div>
                          <div className="gmeta">{[g.phone, g.city].filter(Boolean).join(" · ")}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="guest-none">
                    <div>Niciun client cu „{guestQuery.trim()}”.</div>
                    <button className="btn btn-primary" style={{ width: "auto", marginTop: 10 }} onClick={startAddGuest}>
                      <Plus size={15} /> Adaugă client nou
                    </button>
                  </div>
                )
              )}
            </div>
          )}
        </div>}

        {!isBlock && (
          <div className="field-row field-row-2col">
            <label className="field">
              <span className="fl">Adulți{isGroup ? " (per cameră)" : ""}</span>
              <input type="number" min="1" max={maxOccupancy} value={adults}
                onChange={(e) => setAdults(clampOccupant(e.target.value, children, maxOccupancy, 1))} />
            </label>
            <label className="field">
              <span className="fl">Copii{isGroup ? " (per cameră)" : ""}</span>
              <input type="number" min="0" max={maxOccupancy} value={children}
                onChange={(e) => setChildren(clampOccupant(e.target.value, adults, maxOccupancy, 0))} />
            </label>
          </div>
        )}
        {!isBlock && (
          <div className="note" style={{ marginTop: -6 }}>
            Maxim {maxOccupancy} {maxOccupancy === 1 ? "persoană" : "persoane"} pentru {isGroup ? "camerele selectate" : "camera selectată"}.
          </div>
        )}
        {isGroup && (
          <div className="note">
            Numărul de adulți/copii, etichetele și notele de mai jos se aplică identic pe fiecare
            cameră a grupului. Ocupanții și prețul pot fi ajustați individual după creare, din Grupuri → editează grupul.
          </div>
        )}

        {!isBlock && (
          <label className="field">
            <span className="fl">Sursa rezervării</span>
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCES.map((sc) => <option key={sc.key} value={sc.key}>{sc.label}</option>)}
            </select>
          </label>
        )}

        <div className="field-row">
          <label className="field">
            <span className="fl">{isBlock ? "De la" : "Check-in"}</span>
            <input type="datetime-local" value={checkin} onChange={(e) => setCheckin(e.target.value)} />
          </label>
          <label className="field">
            <span className="fl">{isBlock ? "Până la" : "Check-out"}</span>
            <input type="datetime-local" value={checkout} onChange={(e) => setCheckout(e.target.value)} />
          </label>
        </div>

        {!isBlock && <div className="price-box">
          <div className="pb-info">
            <div className="price-label">
              {nightsBetween(checkin, checkout)} nopți{isGroup && roomIds.length ? ` × ${roomIds.length} camere` : ""}
            </div>
            <div className="price-value">{fmtMoney(previewTotal)}</div>
          </div>
          <div className="pb-manual">
            <label htmlFor="manual-price">Preț manual{isGroup ? " (total grup)" : ""}</label>
            <input id="manual-price" type="number" min="0" step="1" placeholder="auto" value={priceOverride}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || (Number(v) >= 0 && Number.isFinite(Number(v)))) { setPriceOverride(v); setError(""); }
              }} />
          </div>
        </div>}

        {!isBlock && (
          <div className="field">
            <label>Etichete</label>
            <div className="tag-picker">
              {(core.tags || DEFAULT_TAGS).map((t) => (
                <button key={t}
                  className={"tag-chip" + (tags.includes(t) ? " on" : "")}
                  onClick={() => setTags((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])}
                >{t}</button>
              ))}
              {newTagOpen ? (
                <span className="tag-new">
                  <input
                    autoFocus
                    value={newTag}
                    placeholder="Etichetă nouă"
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); commitNewTag(); }
                      if (e.key === "Escape") { e.preventDefault(); setNewTagOpen(false); setNewTag(""); }
                    }}
                  />
                  <button className="icon-btn" onClick={commitNewTag} aria-label="Adaugă eticheta">
                    <Check size={14} />
                  </button>
                </span>
              ) : (
                <button className="tag-chip tag-add" onClick={() => setNewTagOpen(true)}>
                  <Plus size={13} /> Etichetă
                </button>
              )}
            </div>
          </div>
        )}

        {!isBlock && (
          <label className="field">
            <span className="fl">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        )}

        <label className="field">
          <span className="fl">Note</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observații interne" />
        </label>

        {editing?.messages?.length > 0 && (
          <div className="field">
            <label>Mesaje ({editing.messages.length})</label>
            <div className="msg-list" style={{ marginTop: 0 }}>
              {[...editing.messages].reverse().map((m) => (
                <div className="msg-item" key={m.id}>
                  <div className="msg-text">{m.text}</div>
                  <div className="msg-meta">{m.author} · {fmtDateTime(m.ts)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <div className="error-text" role="alert" style={{ marginBottom: 10 }}>{error}</div>}

        {editing && (
          <div className="quick-actions">
            <button className="btn btn-ghost" onClick={() => setShowArrival(true)}>
              <Printer size={14} /> Fișa de sosire
            </button>
            {/* Uses the same canCheckIn rule as the calendar action panel:
                check-in is only offered on the day of arrival, so this
                button no longer appears on future or past reservations. */}
            {canCheckIn(editing) && (
              <button className="btn btn-ghost" onClick={() => { setStatus("checkedin"); }}>
                <LogIn size={14} /> Marchează check-in
              </button>
            )}
            {editing.status === "confirmed" && !canCheckIn(editing) && (
              <span className="quick-hint">
                {new Date(editing.checkin) > new Date()
                  ? `Check-in disponibil în ziua sosirii (${fmtDate(editing.checkin)})`
                  : "Sosirea era într-o zi trecută — corectează data de check-in."}
              </span>
            )}
            {canCheckOut(editing) && (
              <button className="btn btn-ghost" onClick={() => { setStatus("checkedout"); }}>
                Marchează check-out <ArrowRight size={14} />
              </button>
            )}
          </div>
        )}

        <div className="modal-actions">
          {editing && <button className="btn btn-danger" onClick={remove}><Trash2 size={14} /> Șterge</button>}
          <div className="grow" />
          <button className="btn btn-ghost" onClick={onClose}>Anulează</button>
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={save}>
            <Check size={15} /> Salvează
          </button>
        </div>

      {showArrival && editing && (
        <div onClick={(e) => e.stopPropagation()}>
          <ArrivalForm res={editing} core={core} groups={groups} onClose={() => setShowArrival(false)} />
        </div>
      )}

      {guestFormSeed && (
        <div onClick={(e) => e.stopPropagation()}>
          <GuestModal
            guest={guestFormSeed}
            onSave={saveNewGuest}
            onClose={() => setGuestFormSeed(null)}
          />
        </div>
      )}
    </Dialog>
  );
}

/* ---------------------------------------------------------------
   CLIENTS VIEW
----------------------------------------------------------------*/
function ClientsView({ core, updateCore, groups, updateGroups, reservations, updateReservations, blocks, onNewGroup }) {
  const [historyGuest, setHistoryGuest] = useState(null);
  const [tab, setTab] = useState("guests");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(null); // { guest | null }

  const filtered = core.guests.filter((g) => {
    const t = q.toLowerCase();
    return guestFullName(g).toLowerCase().includes(t) ||
      (g.phone || "").includes(q) ||
      (g.city || "").toLowerCase().includes(t);
  });

  const save = async (guest) => {
    const exists = core.guests.some((g) => g.id === guest.id);
    const next = exists ? core.guests.map((g) => (g.id === guest.id ? guest : g)) : [...core.guests, guest];
    await updateCore({ ...core, guests: next });
    await audit.push(exists ? "Client modificat" : "Client adăugat", guestFullName(guest));
    setModal(null);
  };
  const remove = async (id) => {
    const g = core.guests.find((x) => x.id === id);
    const hasReservations = reservations.some((r) => r.guestId === id);
    const isGroupMain = groups.some((gr) => gr.mainGuestId === id);
    if (hasReservations || isGroupMain) {
      toaster.show(
        `${guestFullName(g)} are rezervări asociate și nu poate fi șters. Anulează sau șterge întâi rezervările.`,
        { tone: "danger" }
      );
      return;
    }
    const before = core.guests;
    await updateCore({ ...core, guests: core.guests.filter((x) => x.id !== id) });
    await audit.push("Client șters", guestFullName(g));
    toaster.show(`${guestFullName(g)} a fost șters`, {
      tone: "danger",
      onUndo: async () => {
        await updateCore({ ...core, guests: before });
        await audit.push("Ștergere anulată", guestFullName(g));
      },
    });
  };

  const header = (
    <div className="tabs-bar">
      <SubTabs tab={tab} setTab={setTab} groupCount={groups.length} guestCount={core.guests.length} />
      <div className="tabs-actions">
        {tab === "groups" ? (
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={onNewGroup}>
            <UsersRound size={15} /> Grup nou
          </button>
        ) : (
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setModal({ guest: null })}>
            <Plus size={15} /> Client nou
          </button>
        )}
      </div>
    </div>
  );

  if (tab === "groups") {
    return (
      <div>
        {header}
        <GroupsView core={core} groups={groups} updateGroups={updateGroups}
          reservations={reservations} updateReservations={updateReservations} blocks={blocks} />
      </div>
    );
  }

  return (
    <div>
      {header}
      <div className="toolbar">
        <div className="search-box">
          <Search size={15} color="var(--text-muted)" />
          <input placeholder="Caută după nume sau telefon" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="badge-count">{filtered.length} clienți</span>
      </div>

      <div className="panel">
        {filtered.length === 0 ? (
          <div className="empty-state"><Users size={26} /><h4>Niciun client</h4><p>Adaugă primul client.</p></div>
        ) : filtered.map((g) => (
          <div className="list-row" key={g.id}>
            <div
              role="button" tabIndex={0} style={{ cursor: "pointer" }}
              onClick={() => setHistoryGuest(g)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setHistoryGuest(g); } }}
            >
              <div className="primary">{guestFullName(g)}</div>
              <div className="secondary">
                {[g.phone, g.email, [g.city, g.county].filter(Boolean).join(", "), g.country !== "România" ? g.country : null]
                  .filter(Boolean).join(" · ")}
              </div>
              {(() => {
                const stays = reservations.filter((r) => r.guestId === g.id && isLive(r));
                if (!stays.length) return null;
                const nights = stays.reduce((n, r) => n + nightsBetween(r.checkin, r.checkout), 0);
                const spent = stays.reduce((v, r) => v + reservationTotal(r, core), 0);
                return <div className="secondary" style={{ marginTop: 3 }}>
                  <strong>{stays.length}</strong> sejururi · {nights} nopți · {fmtMoney(spent)} încasați
                </div>;
              })()}
            </div>
            <div className="row-actions">
              <button className="icon-btn" title="Istoric sejururi" aria-label={`Istoric sejururi ${guestFullName(g)}`} onClick={() => setHistoryGuest(g)}>
                <History size={14} />
              </button>
              <button className="icon-btn" onClick={() => setModal({ guest: g })} aria-label={`Editează ${guestFullName(g)}`}><Pencil size={14} /></button>
              <button className="icon-btn" onClick={() => remove(g.id)} aria-label={`Șterge ${guestFullName(g)}`}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      {modal && <GuestModal guest={modal.guest} onSave={save} onClose={() => setModal(null)} />}
      {historyGuest && (
        <GuestHistory guest={historyGuest} core={core} reservations={reservations} onClose={() => setHistoryGuest(null)} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   GUEST FORM — shared by ClientsView and ReservationModal
----------------------------------------------------------------*/
const JUDETE = [
  "Alba", "Arad", "Argeș", "Bacău", "Bihor", "Bistrița-Năsăud", "Botoșani", "Brăila", "Brașov",
  "București", "Buzău", "Călărași", "Caraș-Severin", "Cluj", "Constanța", "Covasna", "Dâmbovița",
  "Dolj", "Galați", "Giurgiu", "Gorj", "Harghita", "Hunedoara", "Ialomița", "Iași", "Ilfov",
  "Maramureș", "Mehedinți", "Mureș", "Neamț", "Olt", "Prahova", "Sălaj", "Satu Mare", "Sibiu",
  "Suceava", "Teleorman", "Timiș", "Tulcea", "Vâlcea", "Vaslui", "Vrancea",
];

const TARI = [
  "România", "Republica Moldova", "Afganistan", "Africa de Sud", "Albania", "Algeria", "Andorra",
  "Angola", "Antigua și Barbuda", "Arabia Saudită", "Argentina", "Armenia", "Australia", "Austria",
  "Azerbaidjan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgia", "Belize",
  "Benin", "Bhutan", "Bolivia", "Bosnia și Herțegovina", "Botswana", "Brazilia", "Brunei",
  "Bulgaria", "Burkina Faso", "Burundi", "Cambodgia", "Camerun", "Canada", "Capul Verde", "Cehia",
  "Chile", "China", "Cipru", "Columbia", "Comore", "Congo", "Coreea de Nord", "Coreea de Sud",
  "Costa Rica", "Coasta de Fildeș", "Croația", "Cuba", "Danemarca", "Djibouti", "Dominica",
  "Ecuador", "Egipt", "El Salvador", "Elveția", "Emiratele Arabe Unite", "Eritreea", "Estonia",
  "Eswatini", "Etiopia", "Fiji", "Filipine", "Finlanda", "Franța", "Gabon", "Gambia", "Georgia",
  "Germania", "Ghana", "Grecia", "Grenada", "Guatemala", "Guineea", "Guineea-Bissau",
  "Guineea Ecuatorială", "Guyana", "Haiti", "Honduras", "India", "Indonezia", "Irak", "Iran",
  "Irlanda", "Islanda", "Israel", "Italia", "Jamaica", "Japonia", "Iordania", "Kazahstan", "Kenya",
  "Kirgizstan", "Kiribati", "Kosovo", "Kuweit", "Laos", "Lesotho", "Letonia", "Liban", "Liberia",
  "Libia", "Liechtenstein", "Lituania", "Luxemburg", "Macedonia de Nord", "Madagascar", "Malaezia",
  "Malawi", "Maldive", "Mali", "Malta", "Maroc", "Insulele Marshall", "Mauritania", "Mauritius",
  "Mexic", "Micronezia", "Monaco", "Mongolia", "Muntenegru", "Mozambic", "Myanmar", "Namibia",
  "Nauru", "Nepal", "Nicaragua", "Niger", "Nigeria", "Norvegia", "Noua Zeelandă", "Olanda", "Oman",
  "Pakistan", "Palau", "Palestina", "Panama", "Papua Noua Guinee", "Paraguay", "Peru", "Polonia",
  "Portugalia", "Qatar", "Regatul Unit", "Republica Centrafricană", "Republica Dominicană",
  "Republica Democrată Congo", "Ruanda", "Rusia", "Saint Kitts și Nevis", "Saint Lucia",
  "Saint Vincent și Grenadinele", "Samoa", "San Marino", "São Tomé și Príncipe", "Senegal",
  "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Siria", "Slovacia", "Slovenia",
  "Insulele Solomon", "Somalia", "Spania", "Sri Lanka", "Statele Unite ale Americii", "Sudan",
  "Sudanul de Sud", "Suedia", "Surinam", "Tadjikistan", "Tanzania", "Thailanda", "Timorul de Est",
  "Togo", "Tonga", "Trinidad și Tobago", "Tunisia", "Turcia", "Turkmenistan", "Tuvalu", "Ucraina",
  "Uganda", "Ungaria", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican", "Venezuela", "Vietnam",
  "Yemen", "Zambia", "Zimbabwe",
];

/* Prefixe telefonice — cheile trebuie sa acopere fiecare tara din TARI.
   Ordinea afisata in selector vine din TARI (Romania prima, apoi
   Republica Moldova, apoi alfabetic), nu de aici. */
const PHONE_DIAL = {
  "România": "+40", "Republica Moldova": "+373", "Afganistan": "+93", "Africa de Sud": "+27",
  "Albania": "+355", "Algeria": "+213", "Andorra": "+376", "Angola": "+244",
  "Antigua și Barbuda": "+1268", "Arabia Saudită": "+966", "Argentina": "+54", "Armenia": "+374",
  "Australia": "+61", "Austria": "+43", "Azerbaidjan": "+994", "Bahamas": "+1242", "Bahrain": "+973",
  "Bangladesh": "+880", "Barbados": "+1246", "Belarus": "+375", "Belgia": "+32", "Belize": "+501",
  "Benin": "+229", "Bhutan": "+975", "Bolivia": "+591", "Bosnia și Herțegovina": "+387",
  "Botswana": "+267", "Brazilia": "+55", "Brunei": "+673", "Bulgaria": "+359", "Burkina Faso": "+226",
  "Burundi": "+257", "Cambodgia": "+855", "Camerun": "+237", "Canada": "+1", "Capul Verde": "+238",
  "Cehia": "+420", "Chile": "+56", "China": "+86", "Cipru": "+357", "Columbia": "+57",
  "Comore": "+269", "Congo": "+242", "Coreea de Nord": "+850", "Coreea de Sud": "+82",
  "Costa Rica": "+506", "Coasta de Fildeș": "+225", "Croația": "+385", "Cuba": "+53",
  "Danemarca": "+45", "Djibouti": "+253", "Dominica": "+1767", "Ecuador": "+593", "Egipt": "+20",
  "El Salvador": "+503", "Elveția": "+41", "Emiratele Arabe Unite": "+971", "Eritreea": "+291",
  "Estonia": "+372", "Eswatini": "+268", "Etiopia": "+251", "Fiji": "+679", "Filipine": "+63",
  "Finlanda": "+358", "Franța": "+33", "Gabon": "+241", "Gambia": "+220", "Georgia": "+995",
  "Germania": "+49", "Ghana": "+233", "Grecia": "+30", "Grenada": "+1473", "Guatemala": "+502",
  "Guineea": "+224", "Guineea-Bissau": "+245", "Guineea Ecuatorială": "+240", "Guyana": "+592",
  "Haiti": "+509", "Honduras": "+504", "India": "+91", "Indonezia": "+62", "Irak": "+964",
  "Iran": "+98", "Irlanda": "+353", "Islanda": "+354", "Israel": "+972", "Italia": "+39",
  "Jamaica": "+1876", "Japonia": "+81", "Iordania": "+962", "Kazahstan": "+7", "Kenya": "+254",
  "Kirgizstan": "+996", "Kiribati": "+686", "Kosovo": "+383", "Kuweit": "+965", "Laos": "+856",
  "Lesotho": "+266", "Letonia": "+371", "Liban": "+961", "Liberia": "+231", "Libia": "+218",
  "Liechtenstein": "+423", "Lituania": "+370", "Luxemburg": "+352", "Macedonia de Nord": "+389",
  "Madagascar": "+261", "Malaezia": "+60", "Malawi": "+265", "Maldive": "+960", "Mali": "+223",
  "Malta": "+356", "Maroc": "+212", "Insulele Marshall": "+692", "Mauritania": "+222",
  "Mauritius": "+230", "Mexic": "+52", "Micronezia": "+691", "Monaco": "+377", "Mongolia": "+976",
  "Muntenegru": "+382", "Mozambic": "+258", "Myanmar": "+95", "Namibia": "+264", "Nauru": "+674",
  "Nepal": "+977", "Nicaragua": "+505", "Niger": "+227", "Nigeria": "+234", "Norvegia": "+47",
  "Noua Zeelandă": "+64", "Olanda": "+31", "Oman": "+968", "Pakistan": "+92", "Palau": "+680",
  "Palestina": "+970", "Panama": "+507", "Papua Noua Guinee": "+675", "Paraguay": "+595",
  "Peru": "+51", "Polonia": "+48", "Portugalia": "+351", "Qatar": "+974", "Regatul Unit": "+44",
  "Republica Centrafricană": "+236", "Republica Dominicană": "+1809",
  "Republica Democrată Congo": "+243", "Ruanda": "+250", "Rusia": "+7",
  "Saint Kitts și Nevis": "+1869", "Saint Lucia": "+1758", "Saint Vincent și Grenadinele": "+1784",
  "Samoa": "+685", "San Marino": "+378", "São Tomé și Príncipe": "+239", "Senegal": "+221",
  "Serbia": "+381", "Seychelles": "+248", "Sierra Leone": "+232", "Singapore": "+65",
  "Siria": "+963", "Slovacia": "+421", "Slovenia": "+386", "Insulele Solomon": "+677",
  "Somalia": "+252", "Spania": "+34", "Sri Lanka": "+94", "Statele Unite ale Americii": "+1",
  "Sudan": "+249", "Sudanul de Sud": "+211", "Suedia": "+46", "Surinam": "+597",
  "Tadjikistan": "+992", "Tanzania": "+255", "Thailanda": "+66", "Timorul de Est": "+670",
  "Togo": "+228", "Tonga": "+676", "Trinidad și Tobago": "+1868", "Tunisia": "+216", "Turcia": "+90",
  "Turkmenistan": "+993", "Tuvalu": "+688", "Ucraina": "+380", "Uganda": "+256", "Ungaria": "+36",
  "Uruguay": "+598", "Uzbekistan": "+998", "Vanuatu": "+678", "Vatican": "+379", "Venezuela": "+58",
  "Vietnam": "+84", "Yemen": "+967", "Zambia": "+260", "Zimbabwe": "+263",
};
/* Ordinea vine din TARI — România prima, apoi Republica Moldova, apoi
   alfabetic — asa ca majoritatea clientilor (romani) gasesc prefixul
   fara sa caute. */
const DIAL_LIST = TARI.map((t) => ({ country: t, dial: PHONE_DIAL[t] })).filter((d) => d.dial);

/* Desparte un numar deja salvat in prefix+rest — daca nu incepe cu "+"
   e tratat ca un numar romanesc vechi (fara prefix), ca sa nu se piarda
   nimic la editarea unei fise existente. */
function splitPhone(phone) {
  const s = String(phone || "").trim();
  if (s.startsWith("+")) {
    const match = DIAL_LIST
      .filter((d) => s.startsWith(d.dial))
      .sort((a, b) => b.dial.length - a.dial.length)[0];
    if (match) return { dial: match.dial, local: s.slice(match.dial.length).trim() };
  }
  return { dial: "+40", local: s };
}
function joinPhone(dial, local) {
  const l = String(local || "").trim();
  return l ? `${dial} ${l}` : "";
}

function PhoneDialPicker({ dial, onSelect }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const t = q.trim().toLowerCase();
  const filtered = t
    ? DIAL_LIST.filter((d) => d.country.toLowerCase().includes(t) || d.dial.includes(t))
    : DIAL_LIST;

  return (
    <div className="phone-dial-wrap" ref={ref}>
      <button type="button" className="phone-dial-btn" onClick={() => setOpen((v) => !v)}>
        <span className="mono">{dial}</span>
      </button>
      {open && (
        <div className="phone-dial-pop">
          <input
            autoFocus placeholder="Caută țara" value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="phone-dial-list">
            {filtered.length === 0 && <div className="phone-dial-empty">Nicio țară găsită.</div>}
            {filtered.map((d) => (
              <button
                type="button" key={d.country}
                className={"phone-dial-item" + (d.dial === dial ? " on" : "")}
                onClick={() => { onSelect(d.dial); setOpen(false); setQ(""); }}
              >
                <span>{d.country}</span>
                <span className="mono">{d.dial}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const emptyGuest = () => ({
  lastName: "", firstName: "", phone: "", email: "",
  address: "", city: "", county: "Cluj", country: "România", notes: "",
});

/* Group rooms can each carry their own occupant, while the group's
   main client stays the billing contact. */
function occupantName(res, core, groups) {
  if (res?.occupantName?.trim()) return res.occupantName.trim();
  if (res?.groupId) {
    const group = groups?.find((g) => g.id === res.groupId);
    if (group?.name?.trim()) return group.name.trim();
  }
  return guestFullName(core.guests.find((g) => g.id === res?.guestId)) || "";
}

function guestFullName(g) {
  if (!g) return "";
  const composed = [g.lastName, g.firstName].filter(Boolean).join(" ").trim();
  return composed || g.name || "";
}

const GuestFields = React.memo(function GuestFields({ value, onChange, invalid }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  const err = (k) => (invalid?.has(k) ? " input-error" : "");
  const { dial, local } = splitPhone(value.phone);
  return (
    <>
      <div className="field-row field-row-2col">
        <label className="field"><span className="fl">Nume *</span><input className={err("lastName")} value={value.lastName} onChange={set("lastName")} placeholder="Popescu" /></label>
        <label className="field"><span className="fl">Prenume *</span><input className={err("firstName")} value={value.firstName} onChange={set("firstName")} placeholder="Andrei" /></label>
      </div>
      <div className="field-row field-row-2col">
        <label className="field">
          <span className="fl">Telefon *</span>
          <div className="phone-input-row">
            <PhoneDialPicker dial={dial} onSelect={(d) => onChange({ ...value, phone: joinPhone(d, local) })} />
            <input className={err("phone")} value={local}
              onChange={(e) => onChange({ ...value, phone: joinPhone(dial, e.target.value) })}
              placeholder="722 111 222" />
          </div>
        </label>
        <label className="field"><span className="fl">Email</span><input type="email" value={value.email} onChange={set("email")} placeholder="nume@exemplu.ro" /></label>
      </div>
      <div className="field-row field-row-2col">
        <label className="field"><span className="fl">Adresă</span><input value={value.address} onChange={set("address")} placeholder="Str. Exemplu nr. 10" /></label>
        <label className="field"><span className="fl">Oraș *</span><input className={err("city")} value={value.city} onChange={set("city")} /></label>
      </div>
      <div className="field-row field-row-2col">
        <div className="field">
          <label>Județ *</label>
          {value.country === "România" ? (
            <select className={err("county")} value={value.county} onChange={set("county")}>
              {JUDETE.map((j) => <option key={j} value={j}>{j}</option>)}
            </select>
          ) : (
            <input className={err("county")} value={value.county} onChange={set("county")} placeholder="Regiune" />
          )}
        </div>
        <label className="field">
          <span className="fl">Țară *</span>
          <select className={err("country")} value={value.country} onChange={set("country")}>
            {TARI.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>
    </>
  );
});

const GUEST_HISTORY_PAGE_SIZE = 15;

function GuestHistory({ guest, core, reservations, onClose }) {
  useModalLock();
  const [page, setPage] = useState(0);
  const stays = reservations
    .filter((r) => r.guestId === guest.id)
    .sort((a, b) => new Date(b.checkin) - new Date(a.checkin));
  const live = stays.filter(isLive);
  const nights = live.reduce((n, r) => n + nightsBetween(r.checkin, r.checkout), 0);
  const spent = live.reduce((v, r) => v + reservationTotal(r, core), 0);

  const pageCount = Math.max(1, Math.ceil(stays.length / GUEST_HISTORY_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageStays = stays.slice(safePage * GUEST_HISTORY_PAGE_SIZE, (safePage + 1) * GUEST_HISTORY_PAGE_SIZE);

  const contactLine = [guest.city, guest.county].filter(Boolean).join(", ");

  return (
    <Dialog onClose={onClose} title={guestFullName(guest)}>

        <div className="guest-contact-info">
          {contactLine && <div>{contactLine}{guest.country && guest.country !== "România" ? ` · ${guest.country}` : ""}</div>}
          {guest.phone && <div><a href={`tel:${guest.phone.replace(/\s/g, "")}`}>{guest.phone}</a></div>}
          {guest.email && <div><a href={`mailto:${guest.email}`}>{guest.email}</a></div>}
        </div>

        <div className="stat-row" style={{ marginBottom: 14 }}>
          <Stat label="Sejururi" value={live.length} sub="valide" />
          <Stat label="Nopți" value={nights} sub="total" />
          <Stat label="Valoare" value={fmtMoney(spent)} sub="cumulat" />
          <Stat label="Ultimul" value={live[0] ? fmtDate(live[0].checkin) : "—"} sub="sosire" />
        </div>

        {stays.length === 0 ? (
          <div className="section-empty">Niciun sejur înregistrat.</div>
        ) : (
          <>
            <div className="panel">
              {pageStays.map((r) => (
                <div className="list-row" key={r.id}>
                  <div>
                    <div className="primary mono">{core.rooms.find((x) => x.id === r.roomId)?.name || "—"}</div>
                    <div className="secondary">
                      {fmtDateFull(r.checkin)} → {fmtDateFull(r.checkout)} · {nightsBetween(r.checkin, r.checkout)} nopți · {sourceLabel(r.source)}
                    </div>
                  </div>
                  <span className={"role-tag " + (r.status === "checkedout" ? "role-receptionist"
                    : isLive(r) ? "role-admin" : "role-housekeeping")}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>
              ))}
            </div>
            {pageCount > 1 && (
              <div className="pager">
                <button className="btn btn-ghost" style={{ width: "auto" }} disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  <ChevronLeft size={15} /> Anterior
                </button>
                <span className="pager-info">Pagina {safePage + 1} din {pageCount}</span>
                <button className="btn btn-ghost" style={{ width: "auto" }} disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>
                  Următor <ChevronRight size={15} />
                </button>
              </div>
            )}
          </>
        )}
      </Dialog>
  );
}

function SubTabs({ tab, setTab, guestCount, groupCount }) {
  return (
    <div className="sub-tabs">
      <button className={tab === "guests" ? "on" : ""} onClick={() => setTab("guests")}>
        <Users size={14} /> Oaspeți <span className="tab-count">{guestCount}</span>
      </button>
      <button className={tab === "groups" ? "on" : ""} onClick={() => setTab("groups")}>
        <UsersRound size={14} /> Grupuri <span className="tab-count">{groupCount}</span>
      </button>
    </div>
  );
}

function GuestModal({ guest, onSave, onClose }) {
  useModalLock();
  const [g, setG] = useState(() => ({ ...emptyGuest(), ...(guest || {}) }));
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState(null);

  const REQUIRED = [
    ["lastName", "nume"], ["firstName", "prenume"], ["phone", "telefon"],
    ["city", "oraș"], ["county", "județ"], ["country", "țară"],
  ];

  const submit = () => {
    const missing = REQUIRED.filter(([k]) => !String(g[k] ?? "").trim());
    if (missing.length) {
      setInvalid(new Set(missing.map(([k]) => k)));
      setError(`Completează: ${missing.map(([, label]) => label).join(", ")}.`);
      return;
    }
    setInvalid(null);
    const record = {
      ...g,
      id: guest?.id || uid(),
      lastName: g.lastName.trim(), firstName: g.firstName.trim(),
      phone: g.phone.trim(), email: g.email.trim(),
      address: g.address.trim(), city: g.city.trim(),
      county: g.county.trim(), country: g.country.trim(),
    };
    record.name = guestFullName(record);
    onSave(record);
  };

  return (
    <Dialog onClose={onClose} title={guest?.id ? "Editează client" : "Client nou"}>
        <GuestFields value={g} invalid={invalid} onChange={(v) => { setG(v); setError(""); setInvalid(null); }} />
        <label className="field"><span className="fl">Note</span><textarea rows={2} value={g.notes} onChange={(e) => setG({ ...g, notes: e.target.value })} /></label>
        {error && <div className="error-text" role="alert" style={{ marginBottom: 10 }}>{error}</div>}
        <div className="modal-actions">
          <div className="grow" />
          <button className="btn btn-ghost" onClick={onClose}>Anulează</button>
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={submit}><Check size={15} /> Salvează</button>
        </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------
   HOUSEKEEPING VIEW
----------------------------------------------------------------*/
const HK_STATUSES = [
  { key: "clean", label: "Curată", cls: "clean" },
  { key: "progress", label: "În curs", cls: "progress" },
  { key: "dirty", label: "Murdară", cls: "dirty" },
];

function HousekeepingView({ core, reservations, housekeeping, updateHousekeeping }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86400000);

  const arrivesToday = (roomId) =>
    reservations.some((r) => r.roomId === roomId && isLive(r) &&
      new Date(r.checkin) >= today && new Date(r.checkin) < tomorrow);

  const setStatus = async (roomId, status) => {
    const next = { ...housekeeping, [roomId]: { status, updatedAt: new Date().toISOString() } };
    await updateHousekeeping(next);
    const label = HK_STATUSES.find((x) => x.key === status)?.label || status;
    await audit.push("Status cameră", `${core.rooms.find((r) => r.id === roomId)?.name} → ${label}`);
  };

  const groups = ["tiny", "loft"].map((t) => ({ type: t, rooms: core.rooms.filter((r) => r.type === t) })).filter((g) => g.rooms.length);

  return (
    <div>
      {groups.map((g) => (
        <div key={g.type} style={{ marginBottom: 22 }}>
          <div className="group-head">
            {ROOM_TYPE[g.type].label}
            <span className="badge-count">{g.rooms.length}</span>
          </div>
          <div className="room-grid">
            {g.rooms.map((room) => {
              const hk = housekeeping[room.id] || { status: "clean" };
              const arrival = arrivesToday(room.id);
              return (
                <div className="room-card" key={room.id}>
                  <div className="top">
                    <h4>{room.name}</h4>
                    {arrival && <span className="arrival-badge">Sosire azi</span>}
                  </div>
                  <div className="status-btns">
                    {HK_STATUSES.map((s) => (
                      <button
                        key={s.key}
                        className={"status-btn" + (hk.status === s.key ? " on " + s.cls : "")}
                        onClick={() => setStatus(room.id, s.key)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------
   ROOMS / DEVICE CONFIG VIEW
----------------------------------------------------------------*/
function RoomsView({ core, updateCore, reservations, updateReservations, blocks, updateBlocks }) {
  const [tab, setTab] = useState("rooms");
  const [modal, setModal] = useState(null);
  const [confirmRoomId, setConfirmRoomId] = useState(null);

  const save = async (room) => {
    const exists = core.rooms.some((r) => r.id === room.id);
    // Merge peste rândul existent (nu înlocuire completă), ca sortOrder/
    // icalToken sau orice alt câmp neexpus în formular să nu se piardă.
    const next = exists
      ? core.rooms.map((r) => (r.id === room.id ? { ...r, ...room } : r))
      : [...core.rooms, room];
    await updateCore({ ...core, rooms: next });
    await audit.push(exists ? "Cameră modificată" : "Cameră adăugată", room.name);
    setModal(null);
  };
  const remove = async (id) => {
    const rm = core.rooms.find((r) => r.id === id);
    const beforeCore = core;
    const beforeRes = reservations;
    const beforeBlocks = blocks;
    const affectedRes = reservations.filter((r) => r.roomId === id).length;
    const affectedBlocks = (blocks || []).filter((b) => b.roomId === id).length;

    await updateCore({ ...core, rooms: core.rooms.filter((r) => r.id !== id) });
    await updateReservations(reservations.filter((r) => r.roomId !== id));
    await updateBlocks((blocks || []).filter((b) => b.roomId !== id));

    const extra = [
      affectedRes ? `${affectedRes} rezervări eliminate` : null,
      affectedBlocks ? `${affectedBlocks} blocaje eliminate` : null,
    ].filter(Boolean).join(" · ");
    await audit.push("Cameră ștearsă", extra ? `${rm?.name || id} · ${extra}` : (rm?.name || id));

    toaster.show(`Camera ${rm?.name || ""} a fost ștearsă`, {
      tone: "danger",
      onUndo: async () => {
        await updateCore(beforeCore);
        await updateReservations(beforeRes);
        await updateBlocks(beforeBlocks);
        await audit.push("Ștergere anulată", rm?.name || id);
      },
    });
  };

  const tabs = (
    <div className="sub-tabs">
      <button className={tab === "rooms" ? "on" : ""} onClick={() => setTab("rooms")}>
        <DoorOpen size={14} /> Camere <span className="tab-count">{core.rooms.length}</span>
      </button>
      <button className={tab === "rates" ? "on" : ""} onClick={() => setTab("rates")}>
        <Banknote size={14} /> Tarife
      </button>
      <button className={tab === "tags" ? "on" : ""} onClick={() => setTab("tags")}>
        <TagIcon size={14} /> Etichete <span className="tab-count">{(core.tags || DEFAULT_TAGS).length}</span>
      </button>
    </div>
  );

  if (tab === "rates") {
    return <div>{tabs}<RatesView core={core} updateCore={updateCore} /></div>;
  }

  if (tab === "tags") {
    return <div>{tabs}<TagsView core={core} updateCore={updateCore} /></div>;
  }

  return (
    <div>
      {tabs}
      <div className="note">
        ID-urile de dispozitiv de mai jos sunt folosite de workflow-ul de automatizare (n8n → Home Assistant) ca să
        știe ce releu Shelly și ce unitate Sensibo aparțin fiecărei camere.
      </div>
      <div className="toolbar">
        <span className="badge-count">{core.rooms.length} camere</span>
        <div className="grow" />
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setModal({ room: null })}>
          <Plus size={15} /> Cameră nouă
        </button>
      </div>
      <div className="panel">
        {core.rooms.map((r) => (
          <div className="list-row" key={r.id}>
            <div>
              <div className="primary">{r.name} <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>· {ROOM_TYPE[r.type]?.label || ""}</span></div>
              <div className="device-row mono"><Flame size={12} /> {r.boilerId} &nbsp; <Wind size={12} /> {r.ventId} &nbsp; <Snowflake size={12} /> {r.sensiboId}</div>
            </div>
            <div className="row-actions">
              <button className="icon-btn" onClick={() => setModal({ room: r })} aria-label={`Editează camera ${r.name}`}><Pencil size={14} /></button>
              {confirmRoomId === r.id ? (
                <>
                  <span style={{ fontSize: 12, color: "var(--danger)", fontWeight: 600 }}>
                    {(() => {
                      const nR = reservations.filter((x) => x.roomId === r.id).length;
                      const nB = (blocks || []).filter((x) => x.roomId === r.id).length;
                      const parts = [];
                      if (nR) parts.push(`${nR} rezervări`);
                      if (nB) parts.push(`${nB} blocaje`);
                      return parts.length ? `Se șterg și ${parts.join(" și ")}` : "Camera nu are rezervări";
                    })()}
                  </span>
                  <button className="btn btn-danger" style={{ padding: "8px 12px" }}
                    onClick={() => { remove(r.id); setConfirmRoomId(null); }}>
                    Șterge tot
                  </button>
                  <button className="btn btn-ghost" style={{ padding: "8px 12px" }}
                    onClick={() => setConfirmRoomId(null)}>
                    Renunță
                  </button>
                </>
              ) : (
                <button className="icon-btn" onClick={() => setConfirmRoomId(r.id)} aria-label={`Șterge camera ${r.name}`}><Trash2 size={14} /></button>
              )}
            </div>
          </div>
        ))}
      </div>
      {modal && <RoomModal room={modal.room} onSave={save} onClose={() => setModal(null)} />}
    </div>
  );
}

function RoomModal({ room, onSave, onClose }) {
  useModalLock();
  const [tab, setTab] = useState("info");
  const [name, setName] = useState(room?.name || "");
  const [type, setType] = useState(room?.type || "tiny");
  const [capacity, setCapacity] = useState(room?.capacity ?? 2);
  const [boilerId, setBoilerId] = useState(room?.boilerId || "");
  const [ventId, setVentId] = useState(room?.ventId || "");
  const [sensiboId, setSensiboId] = useState(room?.sensiboId || "");
  const [error, setError] = useState("");

  const icalUrl = room?.icalToken
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ical-feed/${room.icalToken}.ics`
    : null;
  const copyIcal = async () => {
    if (!icalUrl) return;
    try {
      await navigator.clipboard.writeText(icalUrl);
      toaster.show("Link iCal copiat", { tone: "ok" });
    } catch {
      toaster.show("Nu am putut copia automat — selectează linkul manual.", { tone: "danger" });
    }
  };

  const submit = () => {
    if (!name.trim()) { setError("Numele camerei este obligatoriu."); setTab("info"); return; }
    const cap = Math.max(1, Number(capacity) || 1);
    onSave({
      id: room?.id || uid(), name: name.trim(), type, capacity: cap,
      boilerId: boilerId.trim(), ventId: ventId.trim(), sensiboId: sensiboId.trim(),
    });
  };

  return (
    <Dialog onClose={onClose} title={room ? "Editează cameră" : "Cameră nouă"}>
        <div className="sub-tabs" style={{ marginBottom: 16 }}>
          <button className={tab === "info" ? "on" : ""} onClick={() => setTab("info")}>
            <Info size={14} /> Informații cameră
          </button>
          <button className={tab === "senzori" ? "on" : ""} onClick={() => setTab("senzori")}>
            <Cpu size={14} /> Senzori
          </button>
        </div>

        {tab === "info" ? (
          <>
            <div className="field-row">
              <label className="field"><span className="fl">Nume cameră</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="1015" /></label>
              <label className="field"><span className="fl">Tip</span>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="tiny">Tiny house</option>
                  <option value="loft">Loft</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span className="fl">Link iCal</span>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="mono" readOnly value={icalUrl || "Disponibil după prima salvare"}
                  style={{ color: icalUrl ? undefined : "var(--text-muted)" }} />
                <button type="button" className="icon-btn" onClick={copyIcal} disabled={!icalUrl}
                  aria-label="Copiază linkul iCal" title="Copiază linkul iCal">
                  <Copy size={14} />
                </button>
              </div>
            </label>
            <label className="field">
              <span className="fl">Număr maxim de persoane</span>
              <input type="number" min="1" max="20" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </label>
          </>
        ) : (
          <>
            <label className="field"><span className="fl">ID releu Shelly — boiler</span><input className="mono" value={boilerId} onChange={(e) => setBoilerId(e.target.value)} placeholder="shelly-boiler-1015" /></label>
            <label className="field"><span className="fl">ID releu Shelly — ventilație</span><input className="mono" value={ventId} onChange={(e) => setVentId(e.target.value)} placeholder="shelly-vent-1015" /></label>
            <label className="field"><span className="fl">ID dispozitiv Sensibo — AC</span><input className="mono" value={sensiboId} onChange={(e) => setSensiboId(e.target.value)} placeholder="sensibo-1015" /></label>
          </>
        )}
        {error && <div className="error-text" role="alert" style={{ marginBottom: 10 }}>{error}</div>}
        <div className="modal-actions">
          <div className="grow" />
          <button className="btn btn-ghost" onClick={onClose}>Anulează</button>
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={submit}><Check size={15} /> Salvează</button>
        </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------
   USERS VIEW
----------------------------------------------------------------*/
function UsersView() {
  const [list, setList] = useState(null);
  const [modal, setModal] = useState(null);
  const [loadError, setLoadError] = useState("");
  const adminCount = (list || []).filter((u) => u.role === "admin").length;

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("staff").select("user_id, name, role").order("name");
    if (error) { setLoadError(error.message); return; }
    setList(data);
    setLoadError("");
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (user, isNew) => {
    if (isNew) {
      const { error } = await supabase.from("staff").insert({ user_id: user.user_id, name: user.name, role: user.role });
      if (error) { toaster.show("Nu am putut adăuga userul: " + error.message, { tone: "danger" }); return; }
    } else {
      const { error } = await supabase.from("staff").update({ name: user.name, role: user.role }).eq("user_id", user.user_id);
      if (error) { toaster.show("Nu am putut salva userul: " + error.message, { tone: "danger" }); return; }
    }
    await audit.push(isNew ? "User adăugat" : "User modificat", `${user.name} (${ROLE_LABEL[user.role]})`);
    setModal(null);
    load();
  };

  const remove = async (u) => {
    if (list.length <= 1) {
      toaster.show("Nu poți șterge singurul user rămas.", { tone: "danger" });
      return;
    }
    if (u.role === "admin" && adminCount <= 1) {
      toaster.show("Nu poți șterge singurul admin. Numește întâi alt user admin.", { tone: "danger" });
      return;
    }
    const { error } = await supabase.from("staff").delete().eq("user_id", u.user_id);
    if (error) { toaster.show("Nu am putut șterge userul: " + error.message, { tone: "danger" }); return; }
    await audit.push("User șters", u.name);
    toaster.show(`${u.name} a fost șters`, {
      tone: "danger",
      onUndo: async () => {
        await supabase.from("staff").insert({ user_id: u.user_id, name: u.name, role: u.role });
        await audit.push("Ștergere anulată", u.name);
        load();
      },
    });
    load();
  };

  if (list === null) {
    return loadError
      ? <div className="section-empty">Nu am putut încărca lista de useri: {loadError}</div>
      : <div className="section-empty">Se încarcă…</div>;
  }

  return (
    <div>
      <div className="note">
        Contul (email + parolă) se creează în Supabase → Authentication → Users. De aici legi doar
        numele și rolul de UUID-ul acelui cont.
      </div>
      <div className="toolbar">
        <span className="badge-count">{list.length} useri</span>
        <div className="grow" />
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setModal({ user: null })}>
          <Plus size={15} /> User nou
        </button>
      </div>
      <div className="panel">
        {list.map((u) => (
          <div className="list-row" key={u.user_id}>
            <div>
              <div className="primary">{u.name}</div>
              <div className="secondary mono" style={{ fontSize: 11 }}>{u.user_id}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className={"role-tag role-" + u.role}>{ROLE_LABEL[u.role]}</span>
              <div className="row-actions">
                <button className="icon-btn" onClick={() => setModal({ user: u })} aria-label={`Editează ${u.name}`}><Pencil size={14} /></button>
                <button className="icon-btn" onClick={() => remove(u)} aria-label={`Șterge ${u.name}`}><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {modal && <UserModal user={modal.user} list={list} onSave={save} onClose={() => setModal(null)} />}
    </div>
  );
}

function UserModal({ user, list, onSave, onClose }) {
  useModalLock();
  const isNew = !user;
  const [userId, setUserId] = useState(user?.user_id || "");
  const [name, setName] = useState(user?.name || "");
  const [role, setRole] = useState(user?.role || "receptionist");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const submit = async () => {
    if (!name.trim()) { setError("Numele este obligatoriu."); return; }
    if (isNew && !uuidRe.test(userId.trim())) {
      setError("UUID invalid — copiază-l din Supabase → Authentication → Users.");
      return;
    }
    if (isNew && list.some((u) => u.user_id === userId.trim())) {
      setError("Acest UUID are deja un rol în aplicație.");
      return;
    }
    if (user && user.role === "admin" && role !== "admin") {
      const otherAdmins = list.filter((u) => u.user_id !== user.user_id && u.role === "admin").length;
      if (otherAdmins === 0) {
        setError("Nu poți schimba rolul singurului admin. Numește întâi alt user admin.");
        return;
      }
    }
    setBusy(true);
    await onSave({ user_id: isNew ? userId.trim() : user.user_id, name: name.trim(), role }, isNew);
    setBusy(false);
  };

  return (
    <Dialog onClose={onClose} title={user ? "Editează user" : "User nou"}>
        {isNew && (
          <label className="field">
            <span className="fl">UUID cont Supabase</span>
            <input className="mono" value={userId} onChange={(e) => setUserId(e.target.value)}
              placeholder="ex: 3fa85f64-5717-4562-b3fc-2c963f66afa6" />
          </label>
        )}
        <label className="field"><span className="fl">Nume</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field">
          <span className="fl">Rol</span>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="admin">Admin — acces complet</option>
            <option value="receptionist">Recepționer — rezervări, clienți, camere</option>
            <option value="housekeeping">Cameristă — doar status camere</option>
          </select>
        </label>
        {error && <div className="error-text" role="alert" style={{ marginBottom: 10 }}>{error}</div>}
        <div className="modal-actions">
          <div className="grow" />
          <button className="btn btn-ghost" onClick={onClose}>Anulează</button>
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={submit} disabled={busy}><Check size={15} /> Salvează</button>
        </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------
   PROFILE VIEW
----------------------------------------------------------------*/
const PERMISSIONS = {
  admin: ["Calendar și rezervări", "Clienți", "Status camere", "Automatizare pre-sosire", "Configurare camere și dispozitive", "Administrare useri"],
  receptionist: ["Calendar și rezervări", "Clienți", "Status camere", "Automatizare pre-sosire"],
  housekeeping: ["Status camere"],
};
const ALL_PERMS = PERMISSIONS.admin;

function ProfileView({ user, onLogout, onBack }) {
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const mine = PERMISSIONS[user.role] || [];

  const changePassword = async () => {
    if (password.length < 8) { setMsg({ type: "err", text: "Parola trebuie să aibă cel puțin 8 caractere." }); return; }
    if (password !== password2) { setMsg({ type: "err", text: "Cele două parole nu coincid." }); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setMsg({ type: "err", text: error.message }); return; }
    setPassword(""); setPassword2("");
    setMsg({ type: "ok", text: "Parola a fost schimbată." });
  };

  return (
    <div style={{ maxWidth: 520 }}>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="profile-head">
          <div className="big-avatar">{initials(user.name)}</div>
          <div>
            <div className="pname">{user.name}</div>
            <span className={"role-tag role-" + user.role}>{ROLE_LABEL[user.role]}</span>
          </div>
        </div>
        <div className="perm-list">
          {ALL_PERMS.map((p) => {
            const has = mine.includes(p);
            return (
              <div className={"perm-item" + (has ? "" : " off")} key={p}>
                {has ? <Check size={15} /> : <X size={15} />} {p}
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel" style={{ padding: 20, marginBottom: 16 }}>
        <h4 style={{ margin: "0 0 14px", fontSize: 14 }}>Schimbă parola</h4>
        <div className="field-row">
          <label className="field">
            <span className="fl">Parolă nouă</span>
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setMsg(null); }} />
          </label>
          <label className="field">
            <span className="fl">Confirmă parola</span>
            <input type="password" autoComplete="new-password" value={password2} onChange={(e) => { setPassword2(e.target.value); setMsg(null); }} />
          </label>
        </div>
        {msg && <div className="error-text" role="alert" style={{ color: msg.type === "ok" ? "var(--success)" : "var(--danger)", marginBottom: 10 }}>{msg.text}</div>}
        <button className="btn btn-primary" onClick={changePassword} disabled={busy}><ShieldCheck size={15} /> Salvează parola</button>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-ghost" onClick={onBack}><ChevronLeft size={15} /> Înapoi</button>
        <button className="btn btn-danger" onClick={onLogout}><LogOut size={14} /> Ieși din cont</button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   GROUPS VIEW
----------------------------------------------------------------*/
function GroupsView({ core, groups, updateGroups, reservations, updateReservations, blocks }) {
  const [confirmId, setConfirmId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [printId, setPrintId] = useState(null);
  const [q, setQ] = useState("");

  const removeGroup = async (groupId) => {
    const g = groups.find((x) => x.id === groupId);
    const n = reservations.filter((r) => r.groupId === groupId).length;
    await updateReservations(reservations.filter((r) => r.groupId !== groupId));
    await updateGroups(groups.filter((x) => x.id !== groupId));
    await audit.push("Grup șters", `${g?.name || groupId} · ${n} rezervări`);
    const beforeRes = reservations, beforeGroups = groups;
    toaster.show(`Grupul ${g?.name || ""} a fost șters`, {
      tone: "danger",
      onUndo: async () => {
        await updateReservations(beforeRes);
        await updateGroups(beforeGroups);
        await audit.push("Ștergere grup anulată", g?.name || groupId);
      },
    });
    setConfirmId(null);
  };

  const sorted = [...groups].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (!sorted.length) {
    return (
      <div className="empty-state">
        <UsersRound size={26} />
        <h4>Niciun grup</h4>
        <p>Creezi un grup din Calendar → Rezervare nouă → Grup.</p>
      </div>
    );
  }

  const rows = sorted.map((g) => {
    const res = reservations.filter((r) => r.groupId === g.id);
    const main = core.guests.find((x) => x.id === g.mainGuestId);
    const rooms = res.map((r) => core.rooms.find((rm) => rm.id === r.roomId)?.name).filter(Boolean);
    const ci = res.length ? new Date(Math.min(...res.map((r) => new Date(r.checkin)))) : null;
    const co = res.length ? new Date(Math.max(...res.map((r) => new Date(r.checkout)))) : null;
    return { g, main, rooms, ci, co };
  });

  const t = q.trim().toLowerCase();
  const filtered = !t ? rows : rows.filter(({ g, main }) =>
    g.name.toLowerCase().includes(t) || (main && guestFullName(main).toLowerCase().includes(t)));

  return (
    <div>
      <div className="toolbar">
        <div className="search-box">
          <Search size={15} color="var(--text-muted)" />
          <input placeholder="Caută după numele grupului sau clientul principal"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="badge-count">{filtered.length} {filtered.length === 1 ? "grup" : "grupuri"}</span>
      </div>

      <div className="panel group-table">
        <div className="gt-row gt-head">
          <div className="gt-col gt-col-name">Grup</div>
          <div className="gt-col gt-col-period">Perioadă</div>
          <div className="gt-col gt-col-rooms">Camere</div>
          <div className="gt-col gt-col-actions" />
        </div>

        {filtered.length === 0 ? (
          <div className="section-empty">Niciun grup nu corespunde căutării.</div>
        ) : filtered.map(({ g, main, rooms, ci, co }) => {
          const visibleRooms = rooms.slice(0, 4);
          const extra = rooms.length - visibleRooms.length;
          return (
            <div className="gt-row" key={g.id}>
              <div className="gt-col gt-col-name">
                <div className="primary truncate" title={g.name}>{g.name}</div>
                <div className="secondary truncate" title={main ? guestFullName(main) : undefined}>
                  {main ? guestFullName(main) : "Fără client principal"}
                </div>
              </div>
              <div className="gt-col gt-col-period">
                {ci && co
                  ? <span className="mono">{fmtDate(ci)} → {fmtDate(co)}</span>
                  : <span className="secondary">—</span>}
              </div>
              <div className="gt-col gt-col-rooms">
                <div className="group-rooms">
                  {visibleRooms.map((n) => <span className="room-tag mono" key={n}>{n}</span>)}
                  {extra > 0 && <span className="room-tag room-tag-more">+{extra}</span>}
                  {!rooms.length && <span className="secondary">Fără camere</span>}
                </div>
              </div>
              <div className="gt-col gt-col-actions">
                {confirmId === g.id ? (
                  <>
                    <button className="btn btn-danger" style={{ padding: "8px 12px" }} onClick={() => removeGroup(g.id)}>
                      Șterge tot
                    </button>
                    <button className="btn btn-ghost" style={{ padding: "8px 12px" }} onClick={() => setConfirmId(null)}>
                      Renunță
                    </button>
                  </>
                ) : (
                  <>
                    <button className="icon-btn" onClick={() => setPrintId(g.id)}
                      title="Listă cazare pentru print" aria-label={`Printează lista grupului ${g.name}`}>
                      <Printer size={14} />
                    </button>
                    <button className="icon-btn" onClick={() => setEditId(g.id)}
                      title="Editează grupul" aria-label={`Editează grupul ${g.name}`}>
                      <Pencil size={14} />
                    </button>
                    <button className="icon-btn" onClick={() => setConfirmId(g.id)}
                      title="Șterge grupul și rezervările lui" aria-label={`Șterge grupul ${g.name}`}>
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {printId && (
        <GroupPrint
          group={sorted.find((g) => g.id === printId)}
          core={core}
          reservations={reservations}
          onClose={() => setPrintId(null)}
        />
      )}

      {editId && (
        <GroupEditor
          group={sorted.find((g) => g.id === editId)}
          core={core}
          groups={groups}
          updateGroups={updateGroups}
          reservations={reservations}
          updateReservations={updateReservations}
          onClose={() => setEditId(null)}
          blocks={blocks}
          onPrint={() => { setPrintId(editId); setEditId(null); }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   SHARED: check-in / check-out actions
----------------------------------------------------------------*/
async function doCheckIn(res, reservations, updateReservations, core) {
  if (!canCheckIn(res)) return false;

  // Someone else may still be occupying the room — refuse rather than
  // silently place two guests in it.
  const blocker = reservations.find((r) =>
    r.id !== res.id && r.roomId === res.roomId && r.status === "checkedin" &&
    new Date(r.checkout) > new Date(res.checkin));
  if (blocker) {
    const who = guestFullName(core.guests.find((g) => g.id === blocker.guestId)) || "alt oaspete";
    const room = core.rooms.find((x) => x.id === res.roomId);
    await audit.push("Check-in blocat",
      `${room?.name || res.roomId} · încă ocupată de ${who}`);
    return { error: `Camera ${room?.name || ""} este încă ocupată de ${who}. Fă întâi check-out.` };
  }

  const next = reservations.map((r) => (r.id === res.id ? { ...r, status: "checkedin" } : r));
  await updateReservations(next);
  const room = core.rooms.find((x) => x.id === res.roomId);
  await audit.push("Check-in", `${room?.name || res.roomId} · ${guestFullName(core.guests.find((g) => g.id === res.guestId))}`);
  toaster.show(`Check-in făcut · ${room?.name || ""}`, { tone: "ok" });
  return true;
}

async function doCheckOut(res, reservations, updateReservations, core, housekeeping, updateHousekeeping) {
  if (!canCheckOut(res)) return false;
  const next = reservations.map((r) => (r.id === res.id ? { ...r, status: "checkedout" } : r));
  await updateReservations(next);
  await updateHousekeeping({ ...housekeeping, [res.roomId]: { status: "dirty", updatedAt: new Date().toISOString() } });
  const room = core.rooms.find((x) => x.id === res.roomId);
  await audit.push("Check-out", `${room?.name || res.roomId} · camera trecută pe „murdară”`);
  toaster.show(`Check-out făcut · ${room?.name || ""} trecută pe „murdară”`, { tone: "ok" });
  return true;
}

/* ---------------------------------------------------------------
   ARRIVAL FORM (Fișa de anunțare a sosirii)
   Rendered in-app: artifacts run sandboxed, so a popup window is
   unavailable. Print styles isolate this sheet on paper.
----------------------------------------------------------------*/
function ArrivalSheet({ res, core, groups }) {
  const g = core.guests.find((x) => x.id === res.guestId) || {};
  const room = core.rooms.find((x) => x.id === res.roomId) || {};
  const d = (v) => FMT_DATE_FULL.format(new Date(v)).replace(/\./g, "-");
  const ds = (v) => FMT_DATE.format(new Date(v)).replace(/\.$/, "");

  const Cell = ({ ro, en, value, wide }) => (
    <div className={"fc" + (wide ? " wide" : "")}>
      <div className="fc-lab">
        <span className="ro">{ro}</span>
        <span className="en">{en}</span>
      </div>
      <div className="fc-val">{value || ""}</div>
    </div>
  );

  return (
    <div className="fisa">
      <div className="fisa-top">
        <div className="fisa-logo">LA LIVADĂ</div>
        <div className="fisa-room">
          <div>Nr.</div>
          <div>ROOM No. {room.name || ""}</div>
        </div>
      </div>

      <div className="fisa-title">Fișă de anunțare a sosirii și plecării</div>
      <div className="fisa-sub">Registration form - To be completed on arrival</div>

      <div className="fisa-grid">
        <div className="frow">
          <Cell ro="Nume și prenume" en="Surname and first name"
            value={occupantName(res, core, groups)} wide />
        </div>
        <div className="frow c3">
          <Cell ro="Data nașterii" en="Date of birth" />
          <Cell ro="Locul nașterii" en="Place of birth" />
          <Cell ro="Naționalitate" en="Nationality" value={g.country} />
        </div>
        <div className="frow c3">
          <Cell ro="Localitatea" en="City" value={g.city} />
          <Cell ro="Strada" en="Street" value={g.address} />
          <Cell ro="Țara" en="Country" value={g.country} />
        </div>
        <div className="frow c3">
          <Cell ro="Data sosirii" en="Date of arrival" value={d(res.checkin)} />
          <Cell ro="Data plecării" en="Date of departure" value={d(res.checkout)} />
          <Cell ro="Scopul călătoriei" en="Purpose of travelling" />
        </div>
        <div className="frow c3">
          <Cell ro="Act de identitate" en="Identity card" />
          <Cell ro="Seria" en="Series" />
          <Cell ro="Nr" en="No" />
        </div>
        <div className="frow c2">
          <Cell ro="Semnătura turistului" en="Tourist's signature" />
          <Cell ro="Semnătura recepționerului" en="Receptionist's signature" />
        </div>
      </div>

      <div className="fisa-space" />

      <div className="fisa-foot">
        <div>Unitatea: <strong>La Livada</strong></div>
        <div>office@lalivada.com</div>
      </div>
    </div>
  );
}

function ArrivalForm({ res, core, groups, onClose }) {
  useModalLock();
  return (
    <Dialog onClose={onClose} className="arrival-modal" overlayClassName="arrival-overlay" title={undefined}>
        <div className="modal-head no-print">
          <h3 id="arrival-title">Fișă de anunțare</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => window.print()}>
              <Printer size={15} /> Printează
            </button>
            <button className="icon-btn" onClick={onClose} aria-label="Închide fereastra"><X size={16} /></button>
          </div>
        </div>

        <div className="arrival-sheet">
          <ArrivalSheet res={res} core={core} groups={groups} />
          <div className="fisa-sep" />
          <ArrivalSheet res={res} core={core} groups={groups} />
        </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------
   TODAY VIEW
----------------------------------------------------------------*/
function TodayView({ core, reservations, updateReservations, housekeeping, updateHousekeeping, setView, groups }) {
  const [arrivalRes, setArrivalRes] = useState(null);
  const [checkinError, setCheckinError] = useState("");

  /* One pass over the reservation list instead of six, and O(1) room lookups. */
  const roomById = useMemo(
    () => Object.fromEntries(core.rooms.map((r) => [r.id, r])),
    [core.rooms]);
  const guestById = useMemo(
    () => Object.fromEntries(core.guests.map((g) => [g.id, g])),
    [core.guests]);

  const { arrivals, departures, inHouse, occupiedNow, revenueToday } = useMemo(() => {
    const today = startOfDay(new Date());
    const tomorrow = new Date(today.getTime() + 86400000);
    const arr = [], dep = [], ih = [];
    let occ = 0, rev = 0;

    for (const r of reservations) {
      if (!isLive(r)) continue;
      const ci = new Date(r.checkin), co = new Date(r.checkout);
      if (ci >= today && ci < tomorrow) arr.push(r);
      if (co >= today && co < tomorrow) dep.push(r);
      if (r.status === "checkedin") ih.push(r);
      if (ci < tomorrow && co > today) {
        occ++;
        // Cota pe noapte din pretul REAL (inghetat/manual) al rezervarii,
        // nu un recalcul cu tarifele curente — altfel "Venit azi" nu se
        // potriveste cu ce plateste efectiv oaspetele. Vezi reservationTotal.
        const n = nightsBetween(r.checkin, r.checkout);
        rev += reservationTotal(r, core) / n;
      }
    }
    arr.sort((a, b) => new Date(a.checkin) - new Date(b.checkin));
    dep.sort((a, b) => new Date(a.checkout) - new Date(b.checkout));
    return { arrivals: arr, departures: dep, inHouse: ih, occupiedNow: occ, revenueToday: rev };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservations, roomById, core]);

  const toClean = useMemo(
    () => core.rooms.filter((r) => (housekeeping[r.id]?.status || "clean") !== "clean"),
    [core.rooms, housekeeping]);

  const guestName = (res) => occupantName(res, core, groups) || "Fără nume";
  const roomName = (id) => roomById[id]?.name || id;
  const occupancy = core.rooms.length ? Math.round((occupiedNow / core.rooms.length) * 100) : 0;

  return (
    <div>
      <div className="stat-row">
        <Stat label="Ocupare" value={`${occupancy}%`} sub={`${occupiedNow} din ${core.rooms.length} camere`} />
        <Stat label="Sosiri" value={arrivals.length} sub="astăzi" />
        <Stat label="Plecări" value={departures.length} sub="astăzi" />
        <Stat label="Venit azi" value={fmtMoney(revenueToday)} sub="camere ocupate" />
      </div>

      {checkinError && (
        <div className="drag-error" role="alert" onClick={() => setCheckinError("")}>{checkinError}</div>
      )}

      <div className="today-actions">
        <button className="today-action" onClick={() => setView("housekeeping")}>
          <span className="ta-ico"><Sparkles size={17} /></span>
          <span className="ta-body">
            <span className="ta-t">Status camere</span>
            <span className="ta-d">{toClean.length ? `${toClean.length} de pregătit` : "Toate curate"}</span>
          </span>
          <ArrowRight size={15} className="ta-arrow" />
        </button>
        <button className="today-action" onClick={() => setView("calendar")}>
          <span className="ta-ico"><CalendarDays size={17} /></span>
          <span className="ta-body">
            <span className="ta-t">Calendar</span>
            <span className="ta-d">Rezervări și disponibilitate</span>
          </span>
          <ArrowRight size={15} className="ta-arrow" />
        </button>
        <button className="today-action" onClick={() => setView("clients")}>
          <span className="ta-ico"><Users size={17} /></span>
          <span className="ta-body">
            <span className="ta-t">Clienți</span>
            <span className="ta-d">{core.guests.length} în baza de date</span>
          </span>
          <ArrowRight size={15} className="ta-arrow" />
        </button>
      </div>

      <AutomationStrip core={core} reservations={reservations} />

      <div className="today-cols">
        <Section title="Sosiri" count={arrivals.length} empty="Nicio sosire astăzi.">
          {arrivals.map((r) => (
            <div className="list-row" key={r.id}>
              <div style={{ minWidth: 0 }}>
                <div className="primary">{guestName(r)}</div>
                <div className="secondary">
                  <span className="mono">{roomName(r.roomId)}</span> · {FMT_TIME.format(new Date(r.checkin))} · {fmtMoney(reservationTotal(r, core))}
                </div>
              </div>
              <div className="row-actions">
                <button className="icon-btn" title="Fișa de sosire" aria-label="Deschide fișa de sosire" onClick={() => setArrivalRes(r)}>
                  <Printer size={14} />
                </button>
                {r.status === "checkedin" ? (
                  <span className="role-tag role-housekeeping">Cazat</span>
                ) : r.status === "checkedout" ? (
                  <span className="role-tag role-receptionist">Plecat</span>
                ) : canCheckIn(r) ? (
                  <button className="btn btn-primary" style={{ width: "auto", padding: "8px 12px" }}
                    onClick={async () => {
                      const out = await doCheckIn(r, reservations, updateReservations, core);
                      if (out && out.error) setCheckinError(out.error);
                    }}>
                    <LogIn size={14} /> Check-in
                  </button>
                ) : (
                  <span className="role-tag role-admin">{STATUS_LABEL[r.status]}</span>
                )}
              </div>
            </div>
          ))}
        </Section>

        <Section title="Plecări" count={departures.length} empty="Nicio plecare astăzi.">
          {departures.map((r) => (
            <div className="list-row" key={r.id}>
              <div style={{ minWidth: 0 }}>
                <div className="primary">{guestName(r)}</div>
                <div className="secondary">
                  <span className="mono">{roomName(r.roomId)}</span> · până la {FMT_TIME.format(new Date(r.checkout))}
                </div>
              </div>
              <div className="row-actions">
                {r.status === "checkedout" ? (
                  <span className="role-tag role-receptionist">Plecat</span>
                ) : (
                  <button className="btn btn-ghost" style={{ padding: "8px 12px" }}
                    onClick={() => doCheckOut(r, reservations, updateReservations, core, housekeeping, updateHousekeeping)}>
                    Check-out <ArrowRight size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </Section>

        <Section title="De pregătit" count={toClean.length} empty="Toate camerele sunt curate.">
          {toClean.map((room) => (
            <div className="list-row" key={room.id}>
              <div>
                <div className="primary mono">{room.name}</div>
                <div className="secondary">{ROOM_TYPE[room.type]?.label}</div>
              </div>
              <button className="btn btn-ghost" style={{ padding: "8px 12px" }} onClick={() => setView("housekeeping")}>
                Vezi <ArrowRight size={14} />
              </button>
            </div>
          ))}
        </Section>

        <Section title="În casă acum" count={inHouse.length} empty="Nicio cameră ocupată.">
          {inHouse.map((r) => (
            <div className="list-row" key={r.id}>
              <div>
                <div className="primary">{guestName(r)}</div>
                <div className="secondary"><span className="mono">{roomName(r.roomId)}</span> · pleacă {fmtDate(r.checkout)}</div>
              </div>
            </div>
          ))}
        </Section>
      </div>

      {arrivalRes && <ArrivalForm res={arrivalRes} core={core} groups={groups} onClose={() => setArrivalRes(null)} />}
    </div>
  );
}

const Stat = React.memo(function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
});

const Section = React.memo(function Section({ title, count, empty, children }) {
  const arr = React.Children.toArray(children);
  return (
    <div className="panel section-panel">
      <div className="section-head">{title}<span className="badge-count">{count}</span></div>
      {arr.length ? arr : <div className="section-empty">{empty}</div>}
    </div>
  );
});

/* ---------------------------------------------------------------
   REPORTS VIEW
----------------------------------------------------------------*/
function ReportsView({ core, reservations }) {
  const [monthOffset, setMonthOffset] = useState(0);

  const base = new Date();
  base.setDate(1); base.setHours(0, 0, 0, 0);
  base.setMonth(base.getMonth() + monthOffset);
  const monthStart = new Date(base);
  const monthEnd = new Date(base); monthEnd.setMonth(monthEnd.getMonth() + 1);
  const daysInMonth = Math.round((monthEnd - monthStart) / 86400000);
  const monthStartMs = monthStart.getTime();

  /* All month figures come from one memoized pass: dates parsed once per
     reservation, rooms looked up through a map instead of a linear find
     inside the day loop, and per-type nights accumulated in the same
     sweep rather than re-scanning the month once per room type. */
  const stats = useMemo(() => {
    const roomById = new Map(core.rooms.map((r) => [r.id, r]));
    const active = [];
    for (const r of reservations) {
      if (!isLive(r)) continue;
      const ciMs = new Date(r.checkin).getTime();
      const coMs = new Date(r.checkout).getTime();
      if (!Number.isFinite(ciMs) || !Number.isFinite(coMs)) continue;
      const ciDay = new Date(ciMs); ciDay.setHours(0, 0, 0, 0);
      const coDay = new Date(coMs); coDay.setHours(0, 0, 0, 0);
      // Cota pe noapte din pretul REAL (inghetat/manual), nu un recalcul cu
      // tarifele curente — la fel ca in TodayView.revenueToday, altfel
      // veniturile de aici nu se potrivesc cu cele din "bySource" mai jos.
      const totalNights = Math.max(1, Math.round((coDay - ciDay) / 86400000));
      const perNight = reservationTotal(r, core) / totalNights;
      active.push({ res: r, ciMs, coMs, ciDayMs: ciDay.getTime(), coDayMs: coDay.getTime(), room: roomById.get(r.roomId), perNight });
    }

    let roomNights = 0, revenue = 0;
    const perDay = [];
    const nightsByType = { tiny: 0, loft: 0 };

    for (let i = 0; i < daysInMonth; i++) {
      const d = new Date(monthStart); d.setDate(monthStart.getDate() + i);
      const dStart = d.getTime();
      let occ = 0, rev = 0;
      for (const e of active) {
        // Same room-night rule as the calendar footer: the departure day
        // is not a sold night, so a turnover day counts once, not twice.
        if (e.ciDayMs <= dStart && e.coDayMs > dStart) {
          occ++;
          if (e.room) {
            rev += e.perNight;
            if (nightsByType[e.room.type] != null) nightsByType[e.room.type]++;
          }
        }
      }
      roomNights += occ; revenue += rev;
      perDay.push({ day: i + 1, occ, rev });
    }

    const capacity = core.rooms.length * daysInMonth;
    const byType = ["tiny", "loft"].map((t) => {
      const cap = core.rooms.filter((r) => r.type === t).length * daysInMonth;
      const nights = nightsByType[t] || 0;
      return { type: t, nights, cap, pct: cap ? Math.round((nights / cap) * 100) : 0 };
    });

    const monthEndMs = monthEnd.getTime();
    const inMonth = active.filter((e) => e.ciMs < monthEndMs && e.coMs > monthStartMs);
    const totalInMonth = inMonth.length;
    const bySource = SOURCES.map((sc) => {
      const list = inMonth.filter((e) => (e.res.source || "direct") === sc.key);
      const rev = list.reduce((sum, e) => sum + reservationTotal(e.res, core), 0);
      return { ...sc, count: list.length, rev, pct: totalInMonth ? Math.round((list.length / totalInMonth) * 100) : 0 };
    }).filter((x) => x.count > 0).sort((a, b) => b.count - a.count);

    return {
      roomNights, revenue, perDay, capacity, byType, bySource,
      occupancy: capacity ? Math.round((roomNights / capacity) * 100) : 0,
      adr: roomNights ? revenue / roomNights : 0,
      revpar: capacity ? revenue / capacity : 0,
      maxOcc: Math.max(1, ...perDay.map((p) => p.occ)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservations, core, monthStartMs, daysInMonth]);

  const { roomNights, revenue, perDay, capacity, byType, bySource, occupancy, adr, revpar, maxOcc } = stats;

  return (
    <div>
      <div className="toolbar">
        <div className="week-nav">
          <button onClick={() => setMonthOffset((m) => m - 1)}><ChevronLeft size={15} /></button>
          <button className={monthOffset === 0 ? "on" : ""} onClick={() => setMonthOffset(0)}>
            <span>{FMT_MONTH_YEAR.format(monthStart)}</span>
          </button>
          <button onClick={() => setMonthOffset((m) => m + 1)}><ChevronRight size={15} /></button>
        </div>
      </div>

      <div className="stat-row">
        <Stat label="Ocupare" value={`${occupancy}%`} sub={`${roomNights} din ${capacity} camere-nopți`} />
        <Stat label="Venit" value={fmtMoney(revenue)} sub="prețuri reale, pe nopți din lună" />
        <Stat label="ADR" value={fmtMoney(adr)} sub="tarif mediu pe noapte" />
        <Stat label="RevPAR" value={fmtMoney(revpar)} sub="venit pe cameră disponibilă" />
      </div>

      <div className="panel" style={{ padding: 18, marginBottom: 14 }}>
        <div className="section-head" style={{ padding: 0, border: "none", marginBottom: 14 }}>Ocupare zilnică</div>
        <div className="bar-chart">
          {perDay.map((p) => (
            <div className="bar-col" key={p.day} title={`${p.day}: ${p.occ} camere · ${fmtMoney(p.rev)}`}>
              <div className="bar-fill" style={{ height: `${(p.occ / maxOcc) * 100}%` }} />
              {p.day % 5 === 0 && <span className="bar-label">{p.day}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="section-head">Rezervări pe sursă</div>
        {bySource.length === 0 ? (
          <div className="section-empty">Nicio rezervare în această lună.</div>
        ) : bySource.map((r) => (
          <div className="list-row" key={r.key}>
            <div>
              <div className="primary">{r.label}</div>
              <div className="secondary">{r.count} rezervări · {fmtMoney(r.rev)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 160 }}>
              <div className="meter"><div className="meter-fill" style={{ width: `${r.pct}%` }} /></div>
              <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{r.pct}%</span>
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="section-head">Ocupare pe tip de cameră</div>
        {byType.map((t) => (
          <div className="list-row" key={t.type}>
            <div>
              <div className="primary">{ROOM_TYPE[t.type].label}</div>
              <div className="secondary">{t.nights} din {t.cap} camere-nopți</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 160 }}>
              <div className="meter"><div className="meter-fill" style={{ width: `${t.pct}%` }} /></div>
              <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{t.pct}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   LOG VIEW
----------------------------------------------------------------*/
function LogView({ entries }) {
  if (!entries.length) {
    return <div className="empty-state"><History size={26} /><h4>Jurnal gol</h4><p>Aici apar modificările făcute în aplicație.</p></div>;
  }
  return (
    <div className="panel">
      {entries.map((e) => (
        <div className="list-row" key={e.id}>
          <div style={{ minWidth: 0 }}>
            <div className="primary">{e.action}</div>
            <div className="secondary">{e.detail}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{e.userName}</div>
            <div className="secondary mono" style={{ fontSize: 11 }}>{fmtDateTime(e.ts)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------
   TAGS EDITOR (inside Configurare)
----------------------------------------------------------------*/
function TagsView({ core, updateCore }) {
  const tags = core.tags || DEFAULT_TAGS;
  const [draft, setDraft] = useState("");
  const [editIdx, setEditIdx] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [error, setError] = useState("");

  const save = async (next, action, detail) => {
    await updateCore({ ...core, tags: next });
    await audit.push(action, detail);
    setError("");
  };

  const add = async () => {
    const t = draft.trim();
    if (!t) return;
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) { setError("Eticheta există deja."); return; }
    await save([...tags, t], "Etichetă adăugată", t);
    setDraft("");
  };

  const commitEdit = async (i) => {
    const t = editValue.trim();
    if (!t) { setEditIdx(null); return; }
    if (tags.some((x, j) => j !== i && x.toLowerCase() === t.toLowerCase())) {
      setError("Există deja o etichetă cu acest nume."); return;
    }
    const old = tags[i];
    await save(tags.map((x, j) => (j === i ? t : x)), "Etichetă redenumită", `${old} → ${t}`);
    setEditIdx(null);
  };

  const remove = async (i) => {
    const old = tags[i];
    const before = tags;
    await save(tags.filter((_, j) => j !== i), "Etichetă ștearsă", old);
    toaster.show(`Eticheta „${old}” a fost ștearsă`, {
      tone: "danger",
      onUndo: async () => { await updateCore({ ...core, tags: before }); },
    });
  };

  return (
    <div>
      <div className="note">
        Etichetele apar în formularul de rezervare. Redenumirea uneia nu schimbă rezervările care o au deja
        atașată — acelea păstrează numele vechi.
      </div>

      <div className="toolbar">
        <div className="search-box" style={{ maxWidth: 320 }}>
          <TagIcon size={15} color="var(--text-muted)" />
          <input
            value={draft}
            placeholder="Etichetă nouă"
            onChange={(e) => { setDraft(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </div>
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={add} disabled={!draft.trim()}>
          <Plus size={15} /> Adaugă
        </button>
      </div>

      {error && <div className="drag-error" role="alert" style={{ marginBottom: 10 }}>{error}</div>}

      <div className="panel">
        {tags.length === 0 ? (
          <div className="section-empty">Nicio etichetă definită.</div>
        ) : tags.map((t, i) => (
          <div className="list-row" key={t + i}>
            {editIdx === i ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit(i);
                  if (e.key === "Escape") setEditIdx(null);
                }}
                onBlur={() => commitEdit(i)}
                style={{
                  flex: 1, padding: "9px 11px", border: "1px solid var(--accent)",
                  borderRadius: "var(--r-sm)", fontSize: "var(--fs-base)",
                  background: "var(--surface)", color: "var(--text)",
                }}
              />
            ) : (
              <div className="primary">{t}</div>
            )}
            <div className="row-actions">
              <button className="icon-btn" aria-label={`Redenumește ${t}`}
                onClick={() => { setEditIdx(i); setEditValue(t); setError(""); }}>
                <Pencil size={14} />
              </button>
              <button className="icon-btn" aria-label={`Șterge ${t}`} onClick={() => remove(i)}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   RATES EDITOR (inside Configurare)
----------------------------------------------------------------*/
function RatesView({ core, updateCore }) {
  const rates = core.rates || { base: { tiny: 0, loft: 0 }, seasons: [] };
  const [draft, setDraft] = useState(rates);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(rates);

  /* Daca tarifele se schimba din exterior (ex. un reload fortat de o
     eroare de sincronizare in alta parte a aplicatiei) cat timp pagina
     asta e deschisa, draft-ul ramane blocat pe useState-ul initial —
     resincronizam aici, dar doar cat timp nu exista modificari nesalvate. */
  useEffect(() => {
    if (!dirty) setDraft(rates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rates]);

  const setBase = (key, v) => { setDraft((d) => ({ ...d, base: { ...d.base, [key]: v } })); setSaved(false); };
  const setSeason = (id, patch) => {
    setDraft((d) => ({ ...d, seasons: d.seasons.map((sn) => (sn.id === id ? { ...sn, ...patch } : sn)) }));
    setSaved(false);
  };
  const addSeason = () => {
    setDraft((d) => ({
      ...d,
      seasons: [...d.seasons, { id: uid(), name: "Sezon nou", start: "01-01", end: "01-31", tiny: d.base.tiny, loft: d.base.loft }],
    }));
    setSaved(false);
  };
  const removeSeason = (id) => {
    setDraft((d) => ({ ...d, seasons: d.seasons.filter((sn) => sn.id !== id) }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    const normalized = {
      base: {
        tiny: Number(draft.base.tiny) || 0, loft: Number(draft.base.loft) || 0,
        tinySingle: Number(draft.base.tinySingle) || 0, loftSingle: Number(draft.base.loftSingle) || 0,
        adultSupplement: Number(draft.base.adultSupplement) || 0, childSupplement: Number(draft.base.childSupplement) || 0,
      },
      seasons: draft.seasons.map((sn) => ({ ...sn, tiny: Number(sn.tiny) || 0, loft: Number(sn.loft) || 0 })),
    };
    await updateCore({ ...core, rates: normalized });
    await audit.push("Tarife modificate", "Configurare tarife actualizată");
    setDraft(normalized);
    setSaving(false);
    setSaved(true);
  };

  return (
    <div>
      <div className="note">
        Tarifele sunt pe noapte, per cameră. Sezoanele au prioritate față de tariful de bază; se dau ca zi-lună
        (LL-ZZ) și pot trece peste Anul Nou. Tariful single se aplică doar la 1 adult și niciun copil — orice altă
        ocupare folosește tariful standard, plus suplimentul de adult peste 2 adulți și suplimentul de copil pentru
        fiecare copil. Modificările se salvează doar la apăsarea butonului de mai jos.
      </div>

      <div className="panel" style={{ padding: 18, marginBottom: 16 }}>
        <div className="section-head" style={{ padding: 0, border: "none", marginBottom: 14 }}>Tarif de bază</div>
        <div className="field-row field-row-2col">
          <label className="field">
            <span className="fl">Tiny house (lei/noapte)</span>
            <input type="number" min="0" value={draft.base.tiny} onChange={(e) => setBase("tiny", e.target.value)} />
          </label>
          <label className="field">
            <span className="fl">Loft (lei/noapte)</span>
            <input type="number" min="0" value={draft.base.loft} onChange={(e) => setBase("loft", e.target.value)} />
          </label>
        </div>
        <div className="field-row field-row-2col">
          <label className="field">
            <span className="fl">Supliment adult (lei/noapte)</span>
            <input type="number" min="0" value={draft.base.adultSupplement ?? ""} onChange={(e) => setBase("adultSupplement", e.target.value)} placeholder="0" />
          </label>
          <label className="field">
            <span className="fl">Supliment copil (lei/noapte)</span>
            <input type="number" min="0" value={draft.base.childSupplement ?? ""} onChange={(e) => setBase("childSupplement", e.target.value)} placeholder="0" />
          </label>
        </div>
        <div className="field-row field-row-2col">
          <label className="field">
            <span className="fl">Tiny house — ocupare single (lei/noapte)</span>
            <input type="number" min="0" value={draft.base.tinySingle ?? ""} onChange={(e) => setBase("tinySingle", e.target.value)} placeholder="ex: 300" />
          </label>
          <label className="field">
            <span className="fl">Loft — ocupare single (lei/noapte)</span>
            <input type="number" min="0" value={draft.base.loftSingle ?? ""} onChange={(e) => setBase("loftSingle", e.target.value)} placeholder="ex: 420" />
          </label>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={save} disabled={!dirty || saving}>
            <Check size={15} /> {saving ? "Se salvează…" : "Salvează tarifele"}
          </button>
          {saved && !dirty && <span style={{ color: "var(--success)", fontSize: 13, fontWeight: 600 }}>Salvat</span>}
          {dirty && <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Modificări nesalvate</span>}
        </div>
      </div>

      <div className="toolbar">
        <span className="badge-count">{draft.seasons.length} sezoane</span>
        <div className="grow" />
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={addSeason}><Plus size={15} /> Sezon nou</button>
      </div>

      <div className="panel">
        {draft.seasons.length === 0 ? (
          <div className="section-empty">Niciun sezon — se aplică tariful de bază tot anul.</div>
        ) : draft.seasons.map((sn) => (
          <div key={sn.id} style={{ padding: 16, borderBottom: "1px solid var(--border-soft)" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input value={sn.name} onChange={(e) => setSeason(sn.id, { name: e.target.value })}
                style={{ flex: 1, padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 10, fontSize: 13.5 }} />
              <button className="icon-btn" onClick={() => removeSeason(sn.id)} aria-label={`Șterge sezonul ${sn.name}`}><Trash2 size={14} /></button>
            </div>
            <div className="season-grid">
              <label className="field" style={{ margin: 0 }}>
                <span className="fl">De la (LL-ZZ)</span>
                <input className="mono" value={sn.start} placeholder="06-15" onChange={(e) => setSeason(sn.id, { start: e.target.value })} />
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span className="fl">Până la</span>
                <input className="mono" value={sn.end} placeholder="09-15" onChange={(e) => setSeason(sn.id, { end: e.target.value })} />
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span className="fl">Tiny</span>
                <input type="number" min="0" value={sn.tiny} onChange={(e) => setSeason(sn.id, { tiny: Number(e.target.value) || 0 })} />
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span className="fl">Loft</span>
                <input type="number" min="0" value={sn.loft} onChange={(e) => setSeason(sn.id, { loft: Number(e.target.value) || 0 })} />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   RESERVATION ACTION SHEET
----------------------------------------------------------------*/
function ReservationActions({ res: resSnapshot, core, groups, reservations, updateReservations, housekeeping, updateHousekeeping, onOpen, onMove, onClose }) {
  useModalLock();
  /* The panel was opened with a snapshot; re-read the reservation from the
     live list each render so actions never apply on top of stale state if
     it changed in the background while the panel was open. */
  const res = reservations.find((r) => r.id === resSnapshot.id) || resSnapshot;
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [actionError, setActionError] = useState("");
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgText, setMsgText] = useState("");
  const messages = res.messages || [];
  const guest = core.guests.find((g) => g.id === res.guestId);
  const room = core.rooms.find((r) => r.id === res.roomId);
  const now = new Date();

  const arrivesToday = isSameDay(res.checkin, now);
  const departsToday = isSameDay(res.checkout, now);
  const mayCheckIn = canCheckIn(res, now);
  const mayCheckOut = canCheckOut(res);

  const checkInHint = res.status !== "confirmed"
    ? null
    : arrivesToday ? null
    : new Date(res.checkin) > now
      ? `Check-in disponibil în ziua sosirii (${fmtDate(res.checkin)})`
      : "Sosirea era într-o zi trecută — deschide rezervarea ca să corectezi data.";

  const addMessage = async () => {
    const text = msgText.trim();
    if (!text) return;
    const entry = { id: uid(), ts: new Date().toISOString(), author: audit.user?.name || "?", text };
    await updateReservations(reservations.map((r) =>
      (r.id === res.id ? { ...r, messages: [...(r.messages || []), entry] } : r)));
    await audit.push("Mesaj adăugat la rezervare",
      `${guestFullName(guest) || "Fără nume"} · ${room?.name}: ${text.slice(0, 60)}`);
    setMsgText(""); setMsgOpen(false);
    onClose();
  };

  const cancel = async () => {
    await updateReservations(reservations.map((r) => (r.id === res.id ? { ...r, status: "cancelled" } : r)));
    await audit.push("Rezervare anulată",
      `${guestFullName(guest) || "Fără nume"} · ${room?.name} · ${fmtDate(res.checkin)}`);
    const before = reservations;
    toaster.show(`Rezervarea ${guestFullName(guest) || ""} a fost anulată`, {
      tone: "danger",
      onUndo: async () => {
        await updateReservations(before);
        await audit.push("Anulare revocată", `${guestFullName(guest) || ""} · ${room?.name}`);
      },
    });
    onClose();
  };

  return (
    <Dialog onClose={onClose} className="action-modal" title={undefined}>
        <div className="action-head">
          <div style={{ minWidth: 0 }}>
            <div className="action-guest">{occupantName(res, core, groups) || "Fără nume"}</div>
            {guestFullName(guest) && guestFullName(guest) !== occupantName(res, core, groups) && (
              <div className="action-meta">Rezervat de {guestFullName(guest)}</div>
            )}
            <div className="action-meta">
              <span className="mono">{room?.name}</span> · {fmtDate(res.checkin)} → {fmtDate(res.checkout)}
              {" · "}{nightsBetween(res.checkin, res.checkout)} nopți
            </div>
            <div className="action-meta">
              {res.adults ?? 2} adulți{res.children ? ` + ${res.children} copii` : ""} · {sourceLabel(res.source)} · {fmtMoney(reservationTotal(res, core))}
            </div>
            {res.tags?.length > 0 && (
              <div className="tag-row">
                {res.tags.map((t) => <span className="tag-mini" key={t}>{t}</span>)}
              </div>
            )}
          </div>
          <span className={"role-tag " + (res.status === "checkedin" ? "role-housekeeping"
            : res.status === "cancelled" ? "role-receptionist" : "role-admin")}>
            <span aria-hidden="true">{STATUS_GLYPH[res.status]}</span> {STATUS_LABEL[res.status]}
          </span>
        </div>

        <div className="action-list">
          <button className="action-item" onClick={onOpen}>
            <span className="ai-ico"><Eye size={17} /></span>
            <span className="ai-body"><span className="ai-t">Vezi rezervarea</span>
              <span className="ai-d">Detalii, preț, note și fișa de sosire</span></span>
          </button>

          {mayCheckOut ? (
            <button className="action-item" onClick={async () => {
              await doCheckOut(res, reservations, updateReservations, core, housekeeping, updateHousekeeping);
              onClose();
            }}>
              <span className="ai-ico"><ArrowRight size={17} /></span>
              <span className="ai-body"><span className="ai-t">Check-out</span>
                <span className="ai-d">{departsToday ? "Pleacă astăzi" : "Camera trece pe „murdară”"}</span></span>
            </button>
          ) : (
            <button className="action-item" disabled={!mayCheckIn} onClick={async () => {
              const out = await doCheckIn(res, reservations, updateReservations, core);
              if (out && out.error) { setActionError(out.error); return; }
              onClose();
            }}>
              <span className="ai-ico"><LogIn size={17} /></span>
              <span className="ai-body"><span className="ai-t">Check-in</span>
                <span className="ai-d">{checkInHint || (res.status === "checkedout" ? "Sejur încheiat" : "Sosire astăzi")}</span></span>
            </button>
          )}

          {msgOpen ? (
            <div className="msg-compose">
              <textarea rows={3} autoFocus value={msgText} placeholder="ex. Sosesc după ora 22 · cerere pat suplimentar"
                onChange={(e) => setMsgText(e.target.value)} />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn btn-ghost" style={{ padding: "8px 12px" }}
                  onClick={() => { setMsgOpen(false); setMsgText(""); }}>Renunță</button>
                <button className="btn btn-primary" style={{ width: "auto", padding: "8px 14px" }}
                  onClick={addMessage} disabled={!msgText.trim()}>
                  <Check size={14} /> Salvează
                </button>
              </div>
            </div>
          ) : (
            <button className="action-item" onClick={() => setMsgOpen(true)}>
              <span className="ai-ico"><MessageSquare size={17} /></span>
              <span className="ai-body"><span className="ai-t">Adaugă mesaj</span>
                <span className="ai-d">{messages.length ? `${messages.length} mesaje pe rezervare` : "Notă vizibilă pentru echipă"}</span></span>
            </button>
          )}

          {messages.length > 0 && !msgOpen && (
            <div className="msg-list">
              {messages.slice(-3).reverse().map((m) => (
                <div className="msg-item" key={m.id}>
                  <div className="msg-text">{m.text}</div>
                  <div className="msg-meta">{m.author} · {fmtDateTime(m.ts)}</div>
                </div>
              ))}
            </div>
          )}

          {canNoShow(res, now) && (
            <button className="action-item" onClick={async () => {
              await updateReservations(reservations.map((r) => (r.id === res.id ? { ...r, status: "noshow" } : r)));
              await audit.push("No-show",
                `${guestFullName(guest) || "Fără nume"} · ${room?.name} · ${fmtDate(res.checkin)}`);
              onClose();
            }}>
              <span className="ai-ico"><UserCheck size={17} /></span>
              <span className="ai-body"><span className="ai-t">Marchează no-show</span>
                <span className="ai-d">Nu s-a prezentat — camera se eliberează</span></span>
            </button>
          )}

          <button className="action-item" onClick={onMove} disabled={!isLive(res)}>
            <span className="ai-ico"><MoveRight size={17} /></span>
            <span className="ai-body"><span className="ai-t">Mută camera</span>
              <span className="ai-d">Alegi apoi camera și ziua de sosire</span></span>
          </button>

          {canCancel(res) && (
            confirmCancel ? (
              <div className="action-confirm">
                <span>Anulezi rezervarea?</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-ghost" style={{ padding: "8px 12px" }} onClick={() => setConfirmCancel(false)}>Nu</button>
                  <button className="btn btn-danger" style={{ padding: "8px 12px" }} onClick={cancel}>Da, anulează</button>
                </div>
              </div>
            ) : (
              <button className="action-item danger" onClick={() => setConfirmCancel(true)}>
                <span className="ai-ico"><XCircle size={17} /></span>
                <span className="ai-body"><span className="ai-t">Anulează rezervarea</span>
                  <span className="ai-d">Rămâne în calendar, marcată ca anulată</span></span>
              </button>
            )
          )}
        </div>

        {actionError && <div className="drag-error" role="alert" style={{ marginTop: 10 }}>{actionError}</div>}

        <button className="btn btn-ghost" style={{ width: "100%", marginTop: 6 }} onClick={onClose}>Închide</button>
      </Dialog>
  );
}

/* ---------------------------------------------------------------
   SETTINGS HUB
----------------------------------------------------------------*/
function SettingsView({ setView, items }) {
  return (
    <div className="settings-grid">
      {items.map((it) => (
        <button className="settings-card" key={it.key} onClick={() => setView(it.key)}>
          <span className="ico"><it.icon size={18} /></span>
          <span>
            <span className="t" style={{ display: "block" }}>{it.label}</span>
            <span className="d" style={{ display: "block" }}>{it.desc}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export default function PMSAppRoot() {
  return (
    <ErrorBoundary>
      <PMSApp />
    </ErrorBoundary>
  );
}
