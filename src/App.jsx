import React, { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCcw, Shuffle, Copy, Download, Upload, Info, Sparkles, Trash2, Sun, Moon, X, ChevronDown, ExternalLink, Layers, BarChart3, Wand2, RotateCcw } from "lucide-react";

/**
 * MTG Commander Deck Generator — v7.0
 * Complete UI/UX redesign with Tailwind CSS, modern design system, accessibility.
 */

/***************** Utils & Const *****************/
const COLORS = ["W","U","B","R","G"];
const COLOR_LABELS = { W:"Blanc", U:"Bleu", B:"Noir", R:"Rouge", G:"Vert" };
const MANA_BG = { W:"#f9fae5", U:"#dbeafe", B:"#e9d5ff", R:"#fecaca", G:"#bbf7d0" };
const MECHANIC_TAGS = [
  { key:"tokens", label:"Tokens", matchers:["create a token","token","populate"] },
  { key:"sacrifice", label:"Sacrifice", matchers:["sacrifice a","whenever you sacrifice","devour","exploit","aristocrat"] },
  { key:"lifegain", label:"Gain de vie", matchers:["you gain","lifelink","whenever you gain life"] },
  { key:"+1+1", label:"+1/+1 Counters", matchers:["+1/+1 counter","proliferate","evolve","modular"] },
  { key:"reanimator", label:"Réanimation", matchers:["return target creature card from your graveyard","reanimate","unearth","persist","undying","embalm","eternalize"] },
  { key:"blink", label:"Blink / Flicker", matchers:["exile then return","flicker","phase out","enters the battlefield ","blink"] },
  { key:"spellslinger", label:"Spellslinger", matchers:["instant or sorcery","prowess","magecraft","copy target instant","storm","cast from exile"] },
  { key:"landfall", label:"Landfall", matchers:["landfall","whenever a land enters the battlefield under your control","search your library for a land"] },
  { key:"artifacts", label:"Artefacts", matchers:["artifact you control","improvise","affinity for artifacts","create a treasure","metalcraft"] },
  { key:"enchantress", label:"Enchantements", matchers:["enchantment spell","constellation","aura","enchantress","enchant creature"] },
  { key:"mill", label:"Mill", matchers:["mill","put the top","cards from the top of their library into their graveyard","self-mill"] },
  { key:"voltron", label:"Voltron", matchers:["equip","equipped creature","attach","aura you control","enchanted creature gets"] },
  { key:"tribal", label:"Tribal / Typal", matchers:["creatures you control get","creature of the chosen type","changeling","lord","share a creature type"] },
  { key:"wheels", label:"Wheels / Discard", matchers:["each player discards","discard your hand then draw","wheel","madness","whenever a player discards"] },
  { key:"topdeck", label:"Top Deck", matchers:["top of your library","scry","look at the top","miracle","cascade"] },
  { key:"theft", label:"Vol / Threaten", matchers:["gain control","until end of turn","steal","act of treason","control of target"] },
  { key:"stax", label:"Stax / Tax", matchers:["can't cast","additional cost","each opponent","opponents can't","ward","tax"] },
  { key:"storm", label:"Storm / Combo", matchers:["storm","copy this spell","each spell you cast","magecraft","whenever you cast"] },
  { key:"treasure", label:"Trésors", matchers:["create a treasure","treasure token","sacrifice a treasure","whenever a treasure"] },
  { key:"graveyard", label:"Graveyard", matchers:["from your graveyard","flashback","retrace","dredge","delve","escape","whenever a creature dies"] },
];
const RE = {
  RAMP: /(add \{|search your library for a land|treasure token)/i,
  DRAW: /(draw a card|draw two cards|whenever you draw a card)/i,
  REMOVAL: /(destroy target|exile target|counter target|fight target)/i,
  WRATHS: /(destroy all creatures|exile all creatures|all creatures get)/i,
};

const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
const ciMask = (s)=> s.split("").filter(Boolean).sort().join("");
const identityToQuery = (ci)=> `ci<=${(ci||"c").toLowerCase()}`;
const nameOf = (c)=> c?.name?.trim?.()||"";
const oracle = (c)=> (c?.oracle_text||"").toLowerCase();
const isCommanderLegal = (c)=> c?.legalities?.commander === "legal";
const getCI = (c)=> ciMask((c?.color_identity||[]).join(""));
const unionCI = (a,b)=> ciMask(Array.from(new Set([...(a||"").split(""), ...(b||"").split("")])).join(""));
const priceEUR = (c)=>{ const e=Number(c?.prices?.eur); const f=Number(c?.prices?.eur_foil); return isNaN(e)?(isNaN(f)?0:f):e; };
const edhrecScore = (c)=>{ const r=Number(c?.edhrec_rank)||0; const cap=100000; return r?Math.max(0,1-Math.min(r,cap)/cap):0; };
const distinctBy = (keyFn)=> (arr)=>{ const s=new Set(); return arr.filter(x=>{ const k=keyFn(x); if(s.has(k)) return false; s.add(k); return true;}); };
const distinctByOracle = distinctBy((c)=> c?.oracle_id||c?.id||nameOf(c));
const distinctByName = distinctBy((c)=> nameOf(c));

/***************** Scryfall API *****************/
const sf = {
  async search(q, opts={}){ const params=new URLSearchParams({q, unique:opts.unique||"cards", order:opts.order||"random"}); const r=await fetch(`https://api.scryfall.com/cards/search?${params}`); if(!r.ok) throw new Error(`Scryfall ${r.status}`); return r.json(); },
  async random(q){ const r=await fetch(`https://api.scryfall.com/cards/random?q=${encodeURIComponent(q)}`); if(!r.ok) throw new Error(`Scryfall ${r.status}`); return r.json(); },
  async namedExact(n){ const r=await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(n)}`); if(!r.ok) throw new Error(`Nom introuvable: ${n}`); return r.json(); },
};

/***************** Mana Cost *****************/
const COLOR_HEX = { W:'#fffcd5', U:'#cce6ff', B:'#d6ccff', R:'#ffd6cc', G:'#d5ffd6', C:'#cccccc', X:'#cccccc', S:'#b9d9ff' };
const isDigit = (s)=> /^\d+$/.test(s);
const tokenizeMana = (cost)=> (cost? (cost.match(/\{[^}]+\}/g)||[]).map(x=>x.slice(1,-1)) : []);
const normalize = (tok)=> tok.toUpperCase().replace(/\s+/g,'');
const partsOf = (tok)=> normalize(tok).split('/');

function ManaDot({label, colors}){
  const bg = colors.length===1
    ? { backgroundColor: colors[0] }
    : { backgroundImage: `linear-gradient(135deg, ${colors[0]} 0 50%, ${colors[1]} 50% 100%)` };
  const fs = label.length>=3 ? 7 : 9;
  return (
    <span title={`{${label}}`} className="relative inline-flex items-center justify-center rounded-full border border-black/20 shadow-sm" style={{width:18,height:18}}>
      <span className="absolute inset-0 rounded-full" style={bg}/>
      <span className="relative text-black" style={{fontSize:fs,fontWeight:800,lineHeight:1}}>{label}</span>
    </span>
  );
}
function colorsForToken(tok){
  const parts = partsOf(tok);
  if(parts.length===1){
    const p = parts[0];
    if(isDigit(p)) return ['#dddddd'];
    if(p.endsWith('P')) return [COLOR_HEX[p[0]]||'#eeeeee'];
    return [COLOR_HEX[p]||'#eeeeee'];
  }
  const colors = parts.filter(x=>!isDigit(x) && x!=='P').map(x=> COLOR_HEX[x] || '#eeeeee');
  if(colors.length>=2) return colors.slice(0,2);
  if(colors.length===1) return [colors[0]];
  return ['#dddddd'];
}
function ManaCost({cost}){
  const toks = tokenizeMana(cost);
  if(!toks.length) return null;
  return (
    <span className="mana">
      {toks.map((t,i)=> <ManaDot key={i} label={normalize(t)} colors={colorsForToken(t)}/>)}
    </span>
  );
}

/***************** Hooks *****************/
function useCommanderResolution(mode, chosen, setCI, setError){
  const [card,setCard]=useState(null);
  useEffect(()=>{ let ok=true; (async()=>{
    if(mode!=="select"||!chosen){ setCard(null); return; }
    try{ const c=await resolveCommanderByAnyName(chosen); if(!ok) return; if(!isCommanderLegal(c)) throw new Error("Commandant illégal en EDH"); setCard(c); setCI(getCI(c)); }
    catch(e){ if(ok){ setCard(null); setError(String(e.message||e)); }}
  })(); return ()=>{ok=false}; },[mode, chosen]);
  return card;
}

/***************** Autocomplete *****************/
async function searchCommandersAnyLang(q){
  const base = `legal:commander (type:\"legendary creature\" or (type:planeswalker and o:\"can be your commander\") or type:background) name:${q}`;
  const [en, fr] = await Promise.all([
    sf.search(`${base} unique:prints order:edhrec`),
    sf.search(`${base} lang:fr unique:prints order:edhrec`)
  ]);
  const pool = distinctByOracle([...(en.data||[]), ...(fr.data||[])]).slice(0, 20);
  return pool.map(card=>({
    id: card.id, oracle_id: card.oracle_id,
    display: card.printed_name || card.name, canonical: card.name, type_line: card.type_line,
    image: card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small || card.card_faces?.[1]?.image_uris?.small || "",
    raw: card,
  }));
}

function CommanderAutocomplete({ value, onSelect }){
  const [query,setQuery]=useState(value||"");
  const [sugs,setSugs]=useState([]);
  const [open,setOpen]=useState(false);
  const [loading,setLoading]=useState(false);
  const boxRef = useRef(null);
  useEffect(()=>{ function onDoc(e){ if(boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);} document.addEventListener('mousedown', onDoc); return ()=>document.removeEventListener('mousedown', onDoc); },[]);
  useEffect(()=>{ const q=query.trim(); if(q.length<2){ setSugs([]); setOpen(false); return; } const ac=new AbortController(); const run=async()=>{ setLoading(true); try{ const items=await searchCommandersAnyLang(q); setSugs(items); setOpen(true);}catch(e){ if(e.name!=="AbortError"){ setSugs([]); setOpen(false);} } finally{ setLoading(false);} }; const t=setTimeout(run,220); return ()=>{ ac.abort(); clearTimeout(t); }; },[query]);
  return (
    <div className="relative" ref={boxRef}>
      <label className="block mb-1.5 text-xs font-medium text-muted">Commandant (FR ou EN)</label>
      <input className="input" placeholder="Ex: Etali, tempête primordiale" value={query} onChange={e=>{setQuery(e.target.value); setOpen(true);}} aria-label="Rechercher un commandant" aria-expanded={open} role="combobox" aria-autocomplete="list"/>
      {open && (
        <div className="absolute z-30 mt-2 w-full autocomplete-list" role="listbox">
          {loading && <div className="px-4 py-3 text-sm text-muted">Recherche…</div>}
          {!loading && sugs.length===0 && <div className="px-4 py-3 text-sm text-muted">Aucun commandant trouvé</div>}
          {!loading && sugs.map(s=> (
            <button key={s.id} className="autocomplete-item" role="option" onClick={()=>{ onSelect(s.display); setQuery(s.display); setOpen(false); }}>
              {s.image ? (<img src={s.image} alt="" className="w-10 h-14 object-cover rounded-lg shadow-sm" loading="lazy"/>) : (<div className="w-10 h-14 rounded-lg" style={{background:'var(--surface-strong)'}}/>) }
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{s.display}</div>
                <div className="text-xs text-muted truncate">{s.type_line}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/***************** Upload (Dropzone) *****************/
function FileDrop({ onFiles }){
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const openPicker = ()=> inputRef.current?.click();
  const handleChange = (e)=> { const files = Array.from(e.target.files||[]); if(files.length) onFiles(files); e.target.value=""; };
  const onDragOver = (e)=>{ e.preventDefault(); setDrag(true); };
  const onDragLeave = (e)=>{ e.preventDefault(); setDrag(false); };
  const onDrop = (e)=>{ e.preventDefault(); setDrag(false); const files = Array.from(e.dataTransfer?.files||[]); if(files.length) onFiles(files); };
  return (
    <div className={`dropzone ${drag? 'drag':''}`} onClick={openPicker} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} role="button" tabIndex={0} aria-label="Importer des fichiers de collection" onKeyDown={(e)=>{ if(e.key==='Enter'||e.key===' ') openPicker(); }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{background:'var(--accent-subtle)'}}>
          <Upload className="h-5 w-5" style={{color:'var(--accent)'}}/>
        </div>
        <div>
          <div className="text-sm font-medium">Glisse tes fichiers ici</div>
          <div className="text-xs text-muted mt-1">ou clique pour choisir — TXT, CSV/TSV, JSON</div>
        </div>
      </div>
      <input ref={inputRef} type="file" accept=".txt,.csv,.tsv,.tab,.json" className="sr-only" multiple onChange={handleChange} aria-hidden="true"/>
    </div>
  );
}

/***************** Toggle *****************/
function Toggle({checked, onChange, label, description}){
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer group">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-xs text-muted mt-0.5">{description}</div>}
      </div>
      <button type="button" role="switch" aria-checked={checked} onClick={()=>onChange(!checked)}
        className="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{background: checked ? 'var(--accent)' : 'var(--surface-strong)', border: `1px solid ${checked ? 'var(--accent)' : 'var(--border-strong)'}`}}>
        <span className="inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200" style={{transform: checked ? 'translateX(22px)' : 'translateX(3px)'}}/>
      </button>
    </label>
  );
}

/***************** UI Bits *****************/
function Progress({label, value, targetMin, targetMax}){
  const pct=Math.min(100, Math.round((value/Math.max(1,targetMin))*100));
  const met = value >= targetMin;
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted">
          <span className="font-semibold" style={{color: met ? 'var(--success)' : 'var(--text)'}}>{value}</span> / {targetMin}–{targetMax}
        </span>
      </div>
      <div className="progress-track"><div className="progress-fill animate-bar-fill" style={{width:`${pct}%`}}/></div>
    </div>
  );
}

function CardTile({card, onOpen, qty, owned}){
  return (
    <button className="card-tile" onClick={()=>onOpen(card, owned)} aria-label={`Voir ${card.name}`}>
      {qty ? <span className="badge">x{qty}</span> : null}
      {card.small ? (
        <img src={card.small} alt={card.name} className="w-12 h-16 object-cover rounded-lg shadow-sm" loading="lazy"/>
      ) : (
        <div className="w-12 h-16 rounded-lg" style={{background:'var(--surface-strong)'}}/>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium flex items-center gap-1.5">
          <span className="truncate">{card.name}</span>
          {owned && <span className="owned-check" title="Dans votre collection">✓</span>}
        </div>
        {card.mana_cost && <div className="mt-1"><ManaCost cost={card.mana_cost}/></div>}
      </div>
    </button>
  );
}

function CardModal({open, card, owned, onClose}){
  if(!open||!card) return null;
  const price = (Number(card.prices?.eur)||Number(card.prices?.eur_foil)||0).toFixed(2);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" style={{background:'rgba(0,0,0,0.6)', backdropFilter:'blur(8px)'}} onClick={onClose} role="dialog" aria-modal="true" aria-label={card.name}>
      <div className="relative w-full max-w-2xl rounded-2xl overflow-hidden animate-slide-up" style={{background:'var(--bg)', border:'1px solid var(--border-strong)', boxShadow:'var(--shadow-lg)'}} onClick={(e)=>e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 z-10 btn-ghost rounded-full p-2" aria-label="Fermer"><X className="h-5 w-5"/></button>
        <div className="grid md:grid-cols-2 gap-0">
          {card.image && (
            <div className="p-4 flex items-center justify-center" style={{background:'var(--surface)'}}>
              <img src={card.image} alt={card.name} className="w-full max-w-[280px] rounded-xl shadow-lg"/>
            </div>
          )}
          <div className="p-6 space-y-4">
            <div>
              <h3 className="text-xl font-bold flex items-center gap-2">
                {card.name}
                {owned && <span className="owned-check">✓</span>}
              </h3>
              {card.mana_cost && <div className="mt-2"><ManaCost cost={card.mana_cost}/></div>}
            </div>
            {card.oracle_en && <div className="text-sm whitespace-pre-line leading-relaxed" style={{color:'var(--text-secondary)'}}>{card.oracle_en}</div>}
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted">Prix: <span className="font-semibold" style={{color:'var(--text)'}}>{price}€</span></span>
            </div>
            {card.scryfall_uri && (
              <a href={card.scryfall_uri} target="_blank" rel="noreferrer" className="btn inline-flex text-sm">
                <ExternalLink className="h-4 w-4"/>Voir sur Scryfall
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/***************** Cards helpers *****************/
function bundleCard(c){
  const f = c.card_faces||[];
  const face = (i)=> f[i]?.image_uris?.normal || f[i]?.image_uris?.large || f[i]?.image_uris?.small || "";
  return {
    name: nameOf(c),
    type_line: c.type_line || f[0]?.type_line || "",
    image: c.image_uris?.normal || c.image_uris?.large || face(0) || face(1) || "",
    small: c.image_uris?.small || f[0]?.image_uris?.small || f[1]?.image_uris?.small || "",
    oracle_en: c.oracle_text || f.map(x=>x.oracle_text).filter(Boolean).join('\n'),
    mana_cost: c.mana_cost || f.map(x=>x.mana_cost).filter(Boolean).join(' / '),
    cmc: typeof c.cmc==='number'? c.cmc : (Number(c.cmc)||0),
    prices: c.prices || {},
    scryfall_uri: c.scryfall_uri || c.related_uris?.gatherer || ''
  };
}
async function bundleByName(name){ const c = await sf.namedExact(name); return bundleCard(c); }
const primaryTypeLabel = (tl)=>{
  const t=(tl||"").toLowerCase();
  if(t.includes("creature")) return "Créatures";
  if(t.includes("artifact")) return "Artefacts";
  if(t.includes("enchantment")) return "Enchantements";
  if(t.includes("instant")) return "Éphémères";
  if(t.includes("sorcery")) return "Rituels";
  if(t.includes("planeswalker")) return "Planeswalkers";
  if(t.includes("battle")) return "Batailles";
  if(t.includes("land")) return "Terrains";
  return "Autres";
};

/***************** App *****************/
export default function App(){
  // Theme
  const initialTheme = useMemo(()=>{
    try{
      const saved = localStorage.getItem('theme');
      if(saved==='dark' || saved==='light') return saved;
      if(window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
      return 'dark';
    }catch{ return 'dark'; }
  },[]);
  const [theme,setTheme] = useState(initialTheme);
  useEffect(()=>{
    document.documentElement.setAttribute('data-theme', theme);
    try{ localStorage.setItem('theme', theme); }catch{}
  },[theme]);

  // UI state
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [deck,setDeck]=useState(null);
  const [commanderMode,setCommanderMode]=useState("random");
  const [chosenCommander,setChosenCommander]=useState("");
  const [allowPartner,setAllowPartner]=useState(true);
  const [allowBackground,setAllowBackground]=useState(true);
  const [desiredCI,setDesiredCI]=useState("");
  const [targetLands,setTargetLands]=useState(37);
  const [deckBudget,setDeckBudget]=useState(0);
  const [mechanics,setMechanics]=useState([]);
  const [limitNotice,setLimitNotice]=useState("");
  const [weightOwned,setWeightOwned]=useState(1.0);
  const [weightEdhrec,setWeightEdhrec]=useState(1.0);
  const [targets,setTargets]=useState({ ramp:{min:10,max:12}, draw:{min:9,max:12}, removal:{min:8,max:10}, wraths:{min:3,max:5} });
  const [ownedMap,setOwnedMap]=useState(new Map());
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [modalCard, setModalCard] = useState(null);
  const [modalOwned, setModalOwned] = useState(false);

  const commanderSectionRef = useRef(null);
  const selectedCommanderCard = useCommanderResolution(commanderMode, chosenCommander, setDesiredCI, setError);
  const toggleMechanic=(key)=> setMechanics(prev=> prev.includes(key)? prev.filter(k=>k!==key) : (prev.length>=5?(setLimitNotice("Maximum 5 mécaniques"), setTimeout(()=>setLimitNotice(""),1500), prev):[...prev,key]));

  /*********** Generation ***********/
  const mechanicScore=(card)=> mechanics.length? MECHANIC_TAGS.reduce((s,m)=> s + (mechanics.includes(m.key) && m.matchers.some(k=>oracle(card).includes(k.toLowerCase()))?1:0), 0) : 0;
  const sortByPreference=(pool)=>{ const rb=new Map(pool.map(c=>[nameOf(c), Math.random()])); return [...pool].sort((a,b)=>{ const owA=ownedMap.has(nameOf(a).toLowerCase())?1:0, owB=ownedMap.has(nameOf(b).toLowerCase())?1:0; const sa=weightOwned*owA + weightEdhrec*edhrecScore(a) + 0.25*mechanicScore(a); const sb=weightOwned*owB + weightEdhrec*edhrecScore(b) + 0.25*mechanicScore(b); if(sa!==sb) return sb-sa; const pA=priceEUR(a), pB=priceEUR(b); return pA!==pB? pA-pB : rb.get(nameOf(a))-rb.get(nameOf(b)); }); };
  const greedyPickUnique=(sortedPool, need, banned, currentCost, budget)=>{ const picks=[]; const taken=new Set(banned); let cost=currentCost; for(const c of sortedPool){ if(picks.length>=need) break; const n=nameOf(c); if(taken.has(n)) continue; const p=priceEUR(c); if(budget>0 && (cost+p)>budget) continue; picks.push(c); taken.add(n); cost+=p; } return {picks,cost}; };
  const buildManaBase=(ci, basicTarget)=>{ const colors=(ci||"").split("").filter(Boolean); const basicsByColor={W:"Plains",U:"Island",B:"Swamp",R:"Mountain",G:"Forest"}; if(colors.length===0) return basicTarget>0?{ Wastes: basicTarget }:{}; const per=Math.floor(basicTarget/colors.length); let rem=basicTarget - per*colors.length; const lands={}; for(const c of colors){ const n=basicsByColor[c]; lands[n]=per+(rem>0?1:0); rem--; } return lands; };
  const countCats=(cards)=> cards.reduce((a,c)=>({ ramp:a.ramp+(RE.RAMP.test(oracle(c))||((c.type_line||'').toLowerCase().includes('artifact')&&oracle(c).includes('add one mana'))?1:0), draw:a.draw+(RE.DRAW.test(oracle(c))?1:0), removal:a.removal+(RE.REMOVAL.test(oracle(c))?1:0), wraths:a.wraths+(RE.WRATHS.test(oracle(c))?1:0)}),{ramp:0,draw:0,removal:0,wraths:0});
  const balanceSpells=(picks, pool, budget, spent)=>{ const TARGETS={ ramp:targets.ramp.min, draw:targets.draw.min, removal:targets.removal.min, wraths:targets.wraths.min }; const byName=new Set(picks.map(nameOf)); const counts=countCats(picks); const sorted=sortByPreference(pool); const fits=(cat,c)=> (cat==='ramp'&&RE.RAMP.test(oracle(c)))||(cat==='draw'&&RE.DRAW.test(oracle(c)))||(cat==='removal'&&RE.REMOVAL.test(oracle(c)))||(cat==='wraths'&&RE.WRATHS.test(oracle(c))); const res=[...picks]; for(const cat of Object.keys(TARGETS)){ if(counts[cat]>=TARGETS[cat]) continue; for(const c of sorted){ const n=nameOf(c); if(byName.has(n)) continue; const p=priceEUR(c); if(budget>0 && (spent+p)>budget) continue; if(!fits(cat,c)) continue; const idx=res.findIndex(x=>!fits(cat,x)); if(idx>=0){ byName.delete(nameOf(res[idx])); res[idx]=c; byName.add(n); counts[cat]++; spent+=p; } if(counts[cat]>=TARGETS[cat]) break; } } return {picks:res,spent,targets:TARGETS,counts}; };
  const getPartnerInfo=(c)=>{
    const kw=(c.keywords||[]).map(k=>k.toLowerCase());
    const pwKw=(c.keywords||[]).find(k=>k.toLowerCase().startsWith("partner with "));
    if(pwKw) return {type:"partner_with", name:pwKw.substring("partner with ".length).trim()};
    if(kw.includes("partner")) return {type:"partner"};
    if(kw.includes("friends forever")) return {type:"friends_forever"};
    if(kw.includes("doctor's companion")) return {type:"doctors_companion"};
    if(kw.includes("choose a background")) return {type:"background"};
    const tl=(c.type_line||"").toLowerCase();
    if(tl.includes("time lord") && tl.includes("doctor")) return {type:"time_lord_doctor"};
    return null;
  };
  const pickCommander=async(ci)=>{ if (commanderMode==='select' && selectedCommanderCard) return selectedCommanderCard; const q=["legal:commander","is:commander","game:paper","-is:funny","-keyword:companion", ci?identityToQuery(ci):"", "(type:\"legendary creature\" or (type:planeswalker and o:\"can be your commander\") or type:background)"].filter(Boolean).join(" "); for(let i=0;i<6;i++){ const c=await sf.random(q); if(!isCommanderLegal(c)) continue; return c; } throw new Error("Impossible de trouver un commandant aléatoire conforme."); };
  const maybeAddPartner=async(primary)=>{
    if(!allowPartner) return null;
    const info=getPartnerInfo(primary);
    if(!info || info.type==="background") return null;
    switch(info.type){
      case "partner_with": {
        try{ const c=await sf.namedExact(info.name); if(isCommanderLegal(c)) return c; }catch{}
        return null;
      }
      case "partner": {
        const q='legal:commander is:commander game:paper -is:funny keyword:partner';
        for(let i=0;i<12;i++){ const c=await sf.random(q); if(!isCommanderLegal(c)) continue; if(nameOf(c)===nameOf(primary)) continue; const pi=getPartnerInfo(c); if(pi?.type!=="partner") continue; return c; }
        return null;
      }
      case "friends_forever": {
        const q='legal:commander is:commander game:paper -is:funny keyword:"friends forever"';
        for(let i=0;i<12;i++){ const c=await sf.random(q); if(!isCommanderLegal(c)) continue; if(nameOf(c)===nameOf(primary)) continue; return c; }
        return null;
      }
      case "doctors_companion": {
        const q='legal:commander is:commander game:paper -is:funny type:"Time Lord Doctor"';
        for(let i=0;i<12;i++){ const c=await sf.random(q); if(!isCommanderLegal(c)) continue; if(nameOf(c)===nameOf(primary)) continue; return c; }
        return null;
      }
      case "time_lord_doctor": {
        const q='legal:commander is:commander game:paper -is:funny keyword:"Doctor\'s companion"';
        for(let i=0;i<12;i++){ const c=await sf.random(q); if(!isCommanderLegal(c)) continue; if(nameOf(c)===nameOf(primary)) continue; return c; }
        return null;
      }
      default: return null;
    }
  };
  const maybeAddBackground=async(primary)=>{ const info=getPartnerInfo(primary); if(!allowBackground || !info || info.type!=="background") return null; const q=["legal:commander","type:background","game:paper",identityToQuery(getCI(primary)||"wubrg")].join(" "); for(let i=0;i<10;i++){ const c=await sf.random(q); if(!isCommanderLegal(c)) continue; return c; } return null; };
  const fetchPool=async(ci)=>{ const base=`legal:commander game:paper ${identityToQuery(ci)} -is:funny`; const mech = mechanics.length ? ` (${mechanics.map(k=>{ const tag=MECHANIC_TAGS.find(m=>m.key===k); if(!tag) return ""; const parts=tag.matchers.map(m=>`o:\"${m}\"`).join(" or "); return `(${parts})`; }).join(" or ")})` : ""; const spellsQ=`${base} -type:land -type:background${mech}`; const landsQ =`${base} type:land -type:basic`; const gather=async(q,b,pages=2)=>{ let page=await sf.search(q,{unique:"cards", order:"random"}); b.push(...page.data); for(let i=1;i<pages && page.has_more;i++){ await sleep(100); page=await fetch(page.next_page).then(r=>r.json()); b.push(...page.data);} }; const spells=[], lands=[]; await gather(spellsQ,spells,2); await gather(landsQ,lands,1); return { spells:distinctByName(spells).filter(isCommanderLegal), lands:distinctByName(lands).filter(isCommanderLegal) }; };
  async function buildLandCards(landsMap){ const out=[]; for(const [n,q] of Object.entries(landsMap)){ try{ const b=await bundleByName(n); out.push({...b, qty:q}); } catch { out.push({ name:n, qty:q, image:"", small:"", oracle_en:"", mana_cost:"", cmc:0, prices:{}, scryfall_uri:"" }); } await sleep(60);} return out; }
  const generate=async()=>{ setError(""); setLoading(true); setDeck(null); try{
      const primary = await pickCommander(commanderMode==='random'? desiredCI : getCI(selectedCommanderCard));
      let cmdrs=[primary]; const partner=await maybeAddPartner(primary); const background=await maybeAddBackground(primary); if(partner && background) cmdrs=[primary,partner]; else if(partner) cmdrs=[primary,partner]; else if(background) cmdrs=[primary,background]; let ci=getCI(primary); if(cmdrs.length>1) for(const c of cmdrs) ci=unionCI(ci,getCI(c));
      const pool=await fetchPool(ci);
      const totalBudget=Number(deckBudget)||0; let spent=cmdrs.reduce((s,c)=>s+priceEUR(c),0); if(totalBudget>0 && spent>totalBudget) throw new Error(`Le budget (${totalBudget.toFixed(2)}€) est déjà dépassé par le coût des commandants (${spent.toFixed(2)}€).`);
      const total=100; const landsTarget=Math.max(32, Math.min(40, targetLands)); const spellsTarget=total - cmdrs.length - landsTarget;
      const spellsPref=sortByPreference(pool.spells); const landsPref=sortByPreference(pool.lands);
      const banned=new Set(cmdrs.map(nameOf)); let { picks:pickedSpells, cost:costAfterSpells } = greedyPickUnique(spellsPref, spellsTarget, banned, spent, totalBudget); spent=costAfterSpells;
      const balanced=balanceSpells(pickedSpells, pool.spells, totalBudget, spent); pickedSpells=balanced.picks; spent=balanced.spent;
      const maxNonbasics=Math.min(Math.floor(landsTarget*0.5), landsPref.length); const chosenNonbasics=[]; for(const nb of landsPref){ if(chosenNonbasics.length>=maxNonbasics) break; const p=priceEUR(nb); if(totalBudget>0 && (spent+p)>totalBudget) continue; chosenNonbasics.push(nb); spent+=p; } const basicsNeeded=Math.max(landsTarget - chosenNonbasics.length, 0); const landsMap=buildManaBase(ci, basicsNeeded); for(const nb of chosenNonbasics){ landsMap[nameOf(nb)] = (landsMap[nameOf(nb)]||0)+1; }
      const currentCount=cmdrs.length + pickedSpells.length + Object.values(landsMap).reduce((a,b)=>a+b,0); let missing=100-currentCount; const basicsByColor={W:"Plains",U:"Island",B:"Swamp",R:"Mountain",G:"Forest"}; const firstBasic=(ci.split("")[0] && basicsByColor[ci.split("")[0]]) || "Wastes"; while(missing>0){ landsMap[firstBasic]=(landsMap[firstBasic]||0)+1; missing--; }
      const commandersFull = cmdrs.map(bundleCard);
      const nonlandCards = pickedSpells.map(bundleCard);
      const landCards = await buildLandCards(landsMap);
      setDeck({ colorIdentity:ci,
        commanders:cmdrs.map(nameOf), commandersFull,
        nonlands:Object.fromEntries(pickedSpells.map(c=>[nameOf(c),1])),
        nonlandCards,
        lands:landsMap, landCards,
        budget:totalBudget, spent:Number(spent.toFixed(2)), balanceTargets:targets, balanceCounts:countCats(pickedSpells) });
    }catch(e){ setError(e.message||String(e)); } finally{ setLoading(false); } };

  // Auto-scroll on mobile
  useEffect(()=>{
    if(!deck) return;
    const isSmall = window.matchMedia?.('(max-width: 767px)').matches;
    if(!isSmall) return;
    const el = commanderSectionRef.current;
    if(!el) return;
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if(!prefersReduced){ el.scrollIntoView({ behavior:'smooth', block:'start' }); } else { el.scrollIntoView(); }
  }, [deck]);

  /******** Exports & Utils ********/
  const download=(filename, text)=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:'text/plain'})); a.download=filename; document.body.appendChild(a); a.click(); a.remove(); };
  const mtgoExport=(deck)=>{ const lines=[]; deck.commanders.forEach(c=>lines.push(`1 ${c}`)); Object.entries(deck.nonlands).forEach(([n,q])=>lines.push(`${q} ${n}`)); Object.entries(deck.lands).forEach(([n,q])=>lines.push(`${q} ${n}`)); return lines.join("\n"); };
  const exportTxt=()=>{ if(deck) download("commander-deck.txt", mtgoExport(deck)); };
  const exportJson=()=>{ if(deck) download("commander-deck.json", JSON.stringify(deck,null,2)); };
  const copyList=()=>{ if(!deck) return; const lines=[`// CI: ${deck.colorIdentity||"(Colorless)"} • Budget: ${deck.budget||0}€ • Coût estimé: ${deck.spent||0}€`, ...deck.commanders.map(c=>`1 ${c} // Commander`), ...Object.entries(deck.nonlands).map(([n,q])=>`${q} ${n}`), ...Object.entries(deck.lands).map(([n,q])=>`${q} ${n}`)]; navigator.clipboard.writeText(lines.join("\n")); };

  /******** Collection ********/
  const handleCollectionFile=async(f)=>{ if(!f) return; const parsed=await parseCollectionFile(f); const entry={ id:`${Date.now()}-${Math.random().toString(16).slice(2)}`, name:f.name, map:parsed }; setUploadedFiles(prev=>{ const next=[...prev,entry]; const merged=new Map(); for(const file of next){ for(const [k,q] of file.map){ merged.set(k,(merged.get(k)||0)+q); } } setOwnedMap(merged); return next; }); };
  const removeUploadedFile=(id)=> setUploadedFiles(prev=>{ const next=prev.filter(x=>x.id!==id); const merged=new Map(); for(const file of next){ for(const [k,q] of file.map){ merged.set(k,(merged.get(k)||0)+q); } } setOwnedMap(merged); return next; });
  const clearCollection=()=>{ setOwnedMap(new Map()); setUploadedFiles([]); };

  // Reset all
  const resetAll=()=>{ setLoading(false); setError(""); setDeck(null); setCommanderMode("random"); setChosenCommander(""); setAllowPartner(true); setAllowBackground(true); setDesiredCI(""); setTargetLands(37); setDeckBudget(0); setMechanics([]); setLimitNotice(""); setWeightOwned(1.0); setWeightEdhrec(1.0); setTargets({ ramp:{min:10,max:12}, draw:{min:9,max:12}, removal:{min:8,max:10}, wraths:{min:3,max:5} }); clearCollection(); setShowModal(false); setModalCard(null); setModalOwned(false); };

  // Rebalance
  const reequilibrer=async()=>{ if(!deck) return; try{ setLoading(true); const ci=deck.colorIdentity; const base=`legal:commander game:paper ${identityToQuery(ci)} -is:funny -type:land -type:background`; let page=await sf.search(base,{unique:"cards", order:"edhrec"}); let pool=page.data; if(page.has_more){ const next=await fetch(page.next_page).then(r=>r.json()); pool=pool.concat(next.data||[]);} pool=distinctByName(pool).filter(isCommanderLegal); const currentNames=new Set(Object.keys(deck.nonlands)); const currentObjs=pool.filter(c=> currentNames.has(nameOf(c))); const others=pool.filter(c=> !currentNames.has(nameOf(c))); const totalBudget=deck.budget||0; let spent=0; const balanced=balanceSpells(currentObjs, others, totalBudget, spent); const newNonlands=Object.fromEntries(balanced.picks.map(c=>[nameOf(c),1])); const newNonlandCards=balanced.picks.map(bundleCard); setDeck(prev=>({...prev, nonlands:newNonlands, nonlandCards:newNonlandCards, balanceCounts:balanced.counts, balanceTargets:targets })); } finally { setLoading(false); } };

  const deckSize = useMemo(()=>{ if(!deck) return 0; const cmd=deck.commanders?.length||0; const nl=Object.values(deck?.nonlands||{}).reduce((a,b)=>a+b,0); const ld=Object.values(deck?.lands||{}).reduce((a,b)=>a+b,0); return cmd+nl+ld; },[deck]);
  const nonlandsByType = useMemo(()=>{ if(!deck?.nonlandCards) return {}; const groups = {}; for(const c of deck.nonlandCards){ const k = primaryTypeLabel(c.type_line); (groups[k] ||= []).push(c); } const order = ["Créatures","Artefacts","Enchantements","Éphémères","Rituels","Planeswalkers","Batailles","Autres"]; const sorted = {}; for(const k of order){ if(groups[k]) sorted[k]=groups[k]; } return sorted; },[deck]);
  const isOwned = (cardName)=> ownedMap.has((cardName||"").toLowerCase());
  const stats = useMemo(()=>{
    if(!deck) return null;
    const own = new Map(ownedMap);
    const take = (name, need)=>{ const k=name.toLowerCase(); const have = own.get(k)||0; const used = Math.min(have, need); if(used>0) own.set(k, have-used); return used; };
    let ownedCount=0;
    (deck.commanders||[]).forEach(n=> ownedCount += take(n,1));
    Object.entries(deck.nonlands||{}).forEach(([n,q])=> ownedCount += take(n,q));
    Object.entries(deck.lands||{}).forEach(([n,q])=> ownedCount += take(n,q));
    const total=deckSize;
    const ownedPct = total? Math.round((ownedCount/total)*100) : 0;
    const cmcCards = [...(deck.commandersFull||[]), ...(deck.nonlandCards||[])];
    const cmcVals = cmcCards.map(c=> Number(c.cmc)||0);
    const avgCmc = cmcVals.length? (cmcVals.reduce((a,b)=>a+b,0)/cmcVals.length) : 0;
    const typeCounts = Object.fromEntries(Object.entries(nonlandsByType).map(([k, arr])=> [k, arr.length]));
    return { ownedCount, ownedPct, avgCmc:Number(avgCmc.toFixed(2)), typeCounts };
  },[deck, ownedMap, deckSize, nonlandsByType]);

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <div className="min-h-screen font-sans">
      {/* ─── HEADER ─── */}
      <header className="sticky top-0 z-40 no-print" style={{background:'var(--bg)', borderBottom:'1px solid var(--border)'}}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{background:'var(--accent)', boxShadow:'0 2px 8px var(--accent-glow)'}}>
              <Sparkles className="h-4 w-4 text-white"/>
            </div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate">Commander Craft</h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button className="btn-ghost rounded-full p-2" onClick={()=> setTheme(theme==='dark' ? 'light' : 'dark')} aria-label={theme==='dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}>
              {theme==='dark' ? <Sun className="h-4 w-4"/> : <Moon className="h-4 w-4"/>}
            </button>
            {deck && <>
              <button className="btn-ghost rounded-full p-2" onClick={resetAll} aria-label="Recommencer à zéro" title="Reset"><RotateCcw className="h-4 w-4"/></button>
              <button className="btn-ghost rounded-full p-2" onClick={copyList} aria-label="Copier la liste"><Copy className="h-4 w-4"/></button>
              <button className="btn text-xs hidden sm:inline-flex" onClick={exportJson}><Download className="h-3.5 w-3.5"/>JSON</button>
              <button className="btn-primary text-xs hidden sm:inline-flex" onClick={exportTxt}><Download className="h-3.5 w-3.5"/>Export TXT</button>
            </>}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="grid lg:grid-cols-[340px_1fr] gap-6 lg:gap-8 items-start">

          {/* ═══ SIDEBAR ═══ */}
          <aside className="lg:sticky lg:top-24 space-y-5 no-print">
            {/* Commander */}
            <section className="panel p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-4">Commandant</h2>
              <div className="flex gap-2 mb-4">
                <button className={`btn flex-1 text-xs ${commanderMode==='random'?'btn-active':''}`} onClick={()=>{setCommanderMode('random'); setChosenCommander("");}}>
                  <Shuffle className="h-3.5 w-3.5"/>Aléatoire
                </button>
                <button className={`btn flex-1 text-xs ${commanderMode==='select'?'btn-active':''}`} onClick={()=>setCommanderMode('select')}>
                  <Wand2 className="h-3.5 w-3.5"/>Choisir
                </button>
              </div>
              {commanderMode==='select' && (
                <div className="animate-fade-in">
                  <CommanderAutocomplete value={chosenCommander} onSelect={setChosenCommander} />
                  {selectedCommanderCard && (
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <span className="owned-check">✓</span>
                      <span className="text-secondary truncate">{nameOf(selectedCommanderCard)}</span>
                      <span className="text-muted">({getCI(selectedCommanderCard) || "C"})</span>
                    </div>
                  )}
                </div>
              )}
              {commanderMode!=='select' && (
                <div className="animate-fade-in">
                  <label className="block text-xs font-medium text-muted mb-2">Identité couleur (optionnel)</label>
                  <div className="flex gap-2 flex-wrap">
                    {COLORS.map(c=> (
                      <button key={c} onClick={()=>{ const set=new Set(desiredCI.split("").filter(Boolean)); set.has(c)?set.delete(c):set.add(c); setDesiredCI(ciMask(Array.from(set).join(""))); }}
                        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-150"
                        style={{
                          background: desiredCI.includes(c) ? MANA_BG[c] : 'var(--surface-strong)',
                          border: desiredCI.includes(c) ? `2px solid var(--accent)` : '2px solid var(--border)',
                          color: desiredCI.includes(c) ? '#1a1a2e' : 'var(--text-muted)',
                          boxShadow: desiredCI.includes(c) ? '0 0 0 2px var(--accent-glow)' : 'none',
                        }}
                        aria-label={`${COLOR_LABELS[c]} ${desiredCI.includes(c)?'(sélectionné)':''}`}
                        title={COLOR_LABELS[c]}
                      >{c}</button>
                    ))}
                    {desiredCI && (
                      <button className="btn-ghost text-xs px-2 py-1 rounded-lg" onClick={()=>setDesiredCI("")}>Reset</button>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Mechanics */}
            <section className="panel p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-3">Mécaniques <span className="text-xs font-normal">(max 5)</span></h2>
              <div className="flex flex-wrap gap-1.5">
                {MECHANIC_TAGS.map(m=> (
                  <button key={m.key} className={`chip ${mechanics.includes(m.key)?'chip-active':''}`} onClick={()=>toggleMechanic(m.key)}>
                    {m.label}
                  </button>
                ))}
              </div>
              {limitNotice && <p className="text-xs mt-2" style={{color:'var(--warning)'}}>{limitNotice}</p>}
            </section>

            {/* Fine-tuning */}
            <section className="panel p-5 space-y-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-1">Réglages</h2>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Poids collection</span>
                  <span className="font-semibold" style={{color:'var(--accent)'}}>{weightOwned.toFixed(1)}x</span>
                </div>
                <input type="range" min={0} max={2} step={0.1} value={weightOwned} onChange={e=>setWeightOwned(Number(e.target.value))} aria-label="Poids collection"/>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Poids EDHREC</span>
                  <span className="font-semibold" style={{color:'var(--accent)'}}>{weightEdhrec.toFixed(1)}x</span>
                </div>
                <input type="range" min={0} max={2} step={0.1} value={weightEdhrec} onChange={e=>setWeightEdhrec(Number(e.target.value))} aria-label="Poids EDHREC"/>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Terrains visés</span>
                  <span className="font-semibold" style={{color:'var(--accent)'}}>{targetLands}</span>
                </div>
                <input type="range" min={32} max={40} step={1} value={targetLands} onChange={e=>setTargetLands(Number(e.target.value))} aria-label="Nombre de terrains"/>
              </div>
              <div>
                <label className="block text-sm mb-2">Budget max (EUR)</label>
                <input type="number" min={0} placeholder="0 = illimité" value={deckBudget||''} onChange={e=>setDeckBudget(Number(e.target.value||0))} className="input text-sm" aria-label="Budget en euros"/>
              </div>

              <div className="pt-2 space-y-3 border-t" style={{borderColor:'var(--border)'}}>
                <Toggle checked={allowPartner} onChange={setAllowPartner} label="Autoriser Partner" description="Ajoute un partenaire si le commandant le permet"/>
                <Toggle checked={allowBackground} onChange={setAllowBackground} label="Autoriser Background" description="Si le commandant a « Choose a Background »"/>
              </div>
            </section>

            {/* Generate */}
            <button className="btn-primary w-full py-3 text-base" disabled={loading} onClick={generate} aria-label="Générer un deck">
              {loading ? (
                <><RefreshCcw className="h-5 w-5 animate-spin"/>Génération en cours…</>
              ) : (
                <><Shuffle className="h-5 w-5"/>Générer un deck</>
              )}
            </button>

            {error && (
              <div className="rounded-xl p-3 text-sm animate-fade-in" style={{background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.3)', color:'var(--danger)'}}>
                {error}
              </div>
            )}

            <div className="flex items-start gap-2 text-xs text-muted px-1">
              <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0"/>
              <p>Règles EDH : 100 cartes, singleton, identité couleur, Partner / Partner with / Friends forever / Doctor's companion.</p>
            </div>
          </aside>

          {/* ═══ MAIN CONTENT ═══ */}
          <div className="space-y-6">

            {/* Collection */}
            <section className="panel p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted"/>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Collection</h2>
                </div>
                {uploadedFiles.length > 0 && (
                  <button className="btn-ghost text-xs" onClick={clearCollection}><Trash2 className="h-3.5 w-3.5"/>Vider</button>
                )}
              </div>
              <FileDrop onFiles={async (files)=>{ for(const f of files){ await handleCollectionFile(f); } }}/>
              {uploadedFiles.length > 0 && (
                <div className="mt-4 space-y-2 animate-fade-in">
                  {uploadedFiles.map(f=> (
                    <div key={f.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl" style={{background:'var(--surface-strong)', border:'1px solid var(--border)'}}>
                      <span className="text-sm truncate">{f.name}</span>
                      <button className="btn-ghost p-1 rounded-lg" onClick={()=>removeUploadedFile(f.id)} aria-label={`Supprimer ${f.name}`}><Trash2 className="h-3.5 w-3.5"/></button>
                    </div>
                  ))}
                  <div className="text-xs text-muted px-1">{ownedMap.size} cartes reconnues</div>
                </div>
              )}
            </section>

            {/* Balance targets */}
            <section className="panel p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="h-4 w-4 text-muted"/>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Cibles d'équilibrage</h2>
              </div>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                {["ramp","draw","removal","wraths"].map(cat=> (
                  <div key={cat} className="flex items-center gap-2 text-sm">
                    <span className="w-20 capitalize font-medium">{cat}</span>
                    <label className="text-xs text-muted">Min</label>
                    <input type="number" className="w-14 input px-2 py-1.5 text-xs text-center" value={targets[cat].min} min={0} max={99} onChange={e=>setTargets(prev=>({...prev, [cat]:{...prev[cat], min:Number(e.target.value)||0}}))}/>
                    <label className="text-xs text-muted">Max</label>
                    <input type="number" className="w-14 input px-2 py-1.5 text-xs text-center" value={targets[cat].max} min={0} max={99} onChange={e=>setTargets(prev=>({...prev, [cat]:{...prev[cat], max:Number(e.target.value)||0}}))}/>
                  </div>
                ))}
              </div>
            </section>

            {/* ═══ RESULTS ═══ */}
            {!deck && !loading && (
              <div className="panel p-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{background:'var(--accent-subtle)'}}>
                  <Sparkles className="h-7 w-7" style={{color:'var(--accent)'}}/>
                </div>
                <h3 className="text-lg font-semibold mb-2">Prêt à générer</h3>
                <p className="text-sm text-secondary max-w-sm mx-auto">Configure tes options dans le panneau de gauche, puis clique « Générer un deck ».</p>
              </div>
            )}

            {loading && (
              <div className="panel p-12 text-center animate-fade-in">
                <RefreshCcw className="h-8 w-8 mx-auto mb-4 animate-spin" style={{color:'var(--accent)'}}/>
                <p className="text-sm text-secondary">Génération en cours… Scryfall peut prendre quelques secondes.</p>
              </div>
            )}

            {deck && (
              <div className="space-y-6 animate-slide-up">
                {/* Commander(s) */}
                <section ref={commanderSectionRef} className="panel p-5" style={{scrollMarginTop:'80px'}}>
                  <h2 className="section-title mb-4">Commandant{deck.commanders.length>1?'s':''}</h2>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {deck.commandersFull?.map((c,i)=> {
                      const owned = isOwned(c.name);
                      return (
                        <div key={i} className="rounded-xl overflow-hidden" style={{background:'var(--surface-strong)', border:'1px solid var(--border)'}}>
                          <div className="flex gap-4 p-4">
                            {c.small ? (
                              <img src={c.small} alt={c.name} className="w-20 h-28 object-cover rounded-xl shadow-md cursor-pointer hover:scale-105 transition-transform" onClick={()=>{setModalCard(c); setModalOwned(owned); setShowModal(true);}} loading="lazy"/>
                            ) : (<div className="w-20 h-28 rounded-xl" style={{background:'var(--surface)'}}/>) }
                            <div className="min-w-0 flex-1">
                              <button className="text-left font-semibold hover:underline flex items-center gap-1.5 text-base" onClick={()=>{setModalCard(c); setModalOwned(owned); setShowModal(true);}}>
                                <span className="truncate">{c.name}</span>
                                {owned && <span className="owned-check text-sm">✓</span>}
                              </button>
                              {c.mana_cost && <div className="mt-1.5"><ManaCost cost={c.mana_cost}/></div>}
                              {c.oracle_en && (
                                <div className="text-xs mt-2 text-secondary leading-relaxed" style={{display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical', overflow:'hidden'}}>
                                  {c.oracle_en}
                                </div>
                              )}
                              <div className="text-xs text-muted mt-2">{(Number(c.prices?.eur)||Number(c.prices?.eur_foil)||0).toFixed(2)}€</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                    <span>Identité: <span className="font-semibold" style={{color:'var(--text)'}}>{deck.colorIdentity || "Incolore"}</span></span>
                    <span>Taille: <span className="font-semibold" style={{color:'var(--text)'}}>{deckSize}</span> cartes</span>
                    <span>Coût: <span className="font-semibold" style={{color:'var(--text)'}}>{deck.spent?.toFixed(2)}€</span>{deck.budget ? ` / ${deck.budget}€` : ''}</span>
                  </div>
                </section>

                {/* Balance */}
                <section className="panel p-5">
                  <h2 className="section-title mb-4">Équilibre du deck</h2>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Progress label="Ramp" value={deck.balanceCounts?.ramp||0} targetMin={targets.ramp.min} targetMax={targets.ramp.max}/>
                    <Progress label="Pioche" value={deck.balanceCounts?.draw||0} targetMin={targets.draw.min} targetMax={targets.draw.max}/>
                    <Progress label="Removal" value={deck.balanceCounts?.removal||0} targetMin={targets.removal.min} targetMax={targets.removal.max}/>
                    <Progress label="Wraths" value={deck.balanceCounts?.wraths||0} targetMin={targets.wraths.min} targetMax={targets.wraths.max}/>
                  </div>
                </section>

                {/* Spells by type */}
                <section className="panel p-5">
                  <h2 className="section-title mb-4">Sorts <span className="text-sm font-normal text-muted">({Object.values(deck.nonlands).reduce((a,b)=>a+b,0)})</span></h2>
                  {Object.keys(nonlandsByType).length===0 ? (
                    <p className="text-sm text-muted">Aucun sort détecté.</p>
                  ) : (
                    <div className="space-y-6">
                      {Object.entries(nonlandsByType).map(([label, cards])=> (
                        <div key={label}>
                          <h3 className="section-subtitle mb-3">{label} <span className="text-muted font-normal">({cards.length})</span></h3>
                          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
                            {cards.map((c,idx)=> (
                              <CardTile key={c.name+idx} card={c} owned={isOwned(c.name)} onOpen={(cc, ow)=>{setModalCard(cc); setModalOwned(ow); setShowModal(true);}}/>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Lands */}
                <section className="panel p-5">
                  <h2 className="section-title mb-4">Terrains <span className="text-sm font-normal text-muted">({Object.values(deck.lands).reduce((a,b)=>a+b,0)})</span></h2>
                  {Array.isArray(deck.landCards) && deck.landCards.length>0 ? (
                    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
                      {deck.landCards.map((lc,idx)=> (
                        <CardTile key={lc.name+idx} card={lc} qty={lc.qty} owned={isOwned(lc.name)} onOpen={(cc, ow)=>{setModalCard(cc); setModalOwned(ow); setShowModal(true);}}/>
                      ))}
                    </div>
                  ) : (
                    <div className="grid sm:grid-cols-2 gap-2">
                      {Object.entries(deck.lands).map(([n,q]) => (
                        <div key={n} className="flex justify-between items-center px-3 py-2 rounded-xl text-sm" style={{background:'var(--surface)', border:'1px solid var(--border)'}}>
                          <span>{n}</span><span className="text-muted font-medium">x{q}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Stats */}
                {stats && (
                  <section className="panel p-5">
                    <h2 className="section-title mb-4">Statistiques</h2>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                      <div className="stat-card">
                        <div className="text-xs text-muted mb-1">Cartes possédées</div>
                        <div className="text-2xl font-bold">{stats.ownedCount}<span className="text-sm font-normal text-muted ml-1">/ {deckSize}</span></div>
                        <div className="text-xs text-muted">{stats.ownedPct}%</div>
                      </div>
                      <div className="stat-card">
                        <div className="text-xs text-muted mb-1">Coût estimé</div>
                        <div className="text-2xl font-bold">{(deck.spent||0).toFixed(2)}<span className="text-sm font-normal text-muted ml-1">€</span></div>
                      </div>
                      <div className="stat-card">
                        <div className="text-xs text-muted mb-1">CMC moyen</div>
                        <div className="text-2xl font-bold">{stats.avgCmc}</div>
                      </div>
                      {Object.entries(stats.typeCounts).map(([k,v])=> (
                        <div key={k} className="stat-card flex items-center justify-between">
                          <span className="text-xs text-muted">{k}</span>
                          <span className="text-lg font-bold">{v}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <button className="btn" onClick={copyList}><Copy className="h-4 w-4"/>Copier</button>
                  <button className="btn" onClick={exportJson}><Download className="h-4 w-4"/>JSON</button>
                  <button className="btn-primary" onClick={exportTxt}><Download className="h-4 w-4"/>Export TXT</button>
                  <button className="btn" onClick={reequilibrer} disabled={loading}><Sparkles className="h-4 w-4"/>Rééquilibrer</button>
                  <button className="btn-primary" onClick={generate} disabled={loading}><Shuffle className="h-4 w-4"/>Regénérer</button>
                  <button className="btn" onClick={resetAll}><RotateCcw className="h-4 w-4"/>Recommencer</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <CardModal open={showModal} card={modalCard} owned={modalOwned} onClose={()=>setShowModal(false)}/>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 py-6 text-xs text-muted no-print">
        Commander Craft — Scryfall API (popularité EDHREC via edhrec_rank). Non affilié à Wizards of the Coast.
      </footer>
    </div>
  );
}

/*************** Resolve name FR/EN ***************/
async function resolveCommanderByAnyName(name){
  try { const en = await sf.namedExact(name); if(isCommanderLegal(en)) return en; } catch {}
  const term = `legal:commander name:\"${name}\" (type:legendary or o:\"can be your commander\")`;
  const fr = await sf.search(`${term} lang:fr unique:prints order:released`).catch(()=>null);
  const any = fr?.data?.[0];
  if(any){
    const oid = any.oracle_id;
    const enOfSame = await sf.search(`oracleid:${oid} lang:en order:released unique:prints`).catch(()=>null);
    const best = enOfSame?.data?.[0] || any;
    if(isCommanderLegal(best)) return best;
  }
  const gen = await sf.search(`legal:commander name:${name} (type:legendary or o:\"can be your commander\") order:edhrec`).catch(()=>null);
  const pick = gen?.data?.find(isCommanderLegal) || gen?.data?.[0];
  if(pick) return pick;
  throw new Error(`Impossible de résoudre le nom: ${name}`);
}

/************** Import collection (parser) **************/
async function parseCollectionFile(file){
  const text=await file.text(); const ext=file.name.split('.').pop().toLowerCase(); const rows=[];
  if(ext==="json"){ try{ const data=JSON.parse(text); if(Array.isArray(data)) for(const it of data){ if(it?.name) rows.push({name:String(it.name).trim(), qty:Number(it.quantity||it.qty||1)||1}); } }catch{} }
  else if(["csv","tsv","tab"].includes(ext)){
    const lines=text.split(/\r?\n/).filter(Boolean); const [h0,...rest]=lines; const headers=h0.toLowerCase().split(/,|\t|;/).map(s=>s.trim()); const hasHeader=headers.includes('name'); const dataLines=hasHeader?rest:lines;
    for(const line of dataLines){ const cols=line.split(/,|\t|;/).map(s=>s.trim()); let name="", qty=1; if(hasHeader){ const obj=Object.fromEntries(cols.map((v,i)=>[headers[i]||`c${i}`,v])); name=obj.name||obj.card||""; qty=Number(obj.count||obj.qty||obj.quantity||1)||1; } else { const [a,b]=cols; if(/^\d+$/.test(a)){ qty=Number(a); name=b; } else if(/^\d+$/.test(b)){ qty=Number(b); name=a; } else { name=line.trim(); qty=1; } } if(name) rows.push({name,qty}); }
  }
  else {
    for(const line of text.split(/\r?\n/)){ const m=line.match(/^\s*(\d+)\s+(.+?)\s*$/); if(m) rows.push({name:m[2].trim(), qty:Number(m[1])}); else if(line.trim()) rows.push({name:line.trim(), qty:1}); }
  }
  const map=new Map(); for(const {name,qty} of rows){ const k=name.toLowerCase(); map.set(k,(map.get(k)||0)+qty); }
  return map;
}

/************** Minimal tests (dev console) **************/
(function runUnitTests(){
  if (typeof window === 'undefined') return; if (window.__MTG_V7_TESTED__) return; window.__MTG_V7_TESTED__=true;
  const cases = [
    { in:"{3}{G}{G}", out:["3","G","G"] },
    { in:"{X}{U/R}{2}", out:["X","U/R","2"] },
    { in:"{C}{10}", out:["C","10"] },
  ];
  for (const c of cases){
    const toks = tokenizeMana(c.in);
    console.assert(JSON.stringify(toks.map(x=>x.toUpperCase()))===JSON.stringify(c.out), `tokenizeMana failed for ${c.in}`, toks);
  }
})();
