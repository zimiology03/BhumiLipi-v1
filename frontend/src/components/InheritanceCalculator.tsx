import { useState } from 'react'
import './InheritanceCalculator.css'

type Props = { bangla: boolean }
type ResultRow = { heir: string; count: number; fraction: number }
type Calculation = { area: number; rows: ResultRow[]; method: string[]; remaining: number }

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9

function calculateShares(input: {
  area: number
  deceased: 'man' | 'woman'
  spouses: number
  sons: number
  daughters: number
  father: boolean
  mother: boolean
  siblings: number
}): Calculation {
  const { area, deceased, spouses, sons, daughters, father, mother, siblings } = input
  const hasChildren = sons + daughters > 0
  const spouseCount = deceased === 'man' ? spouses : Math.min(spouses, 1)
  if (siblings > 0 && !father && !hasChildren) {
    throw new Error('unsupported_sibling_case')
  }
  if (!hasChildren && !father && !mother && spouseCount === 0) {
    throw new Error('no_supported_heir')
  }

  const rows: ResultRow[] = []
  const method: string[] = []
  let spouseShare = 0
  if (spouseCount > 0) {
    spouseShare = deceased === 'man'
      ? (hasChildren ? 1 / 8 : 1 / 4)
      : (hasChildren ? 1 / 4 : 1 / 2)
    rows.push({ heir: deceased === 'man' ? 'wives' : 'husband', count: spouseCount, fraction: spouseShare })
    method.push(hasChildren ? 'spouse_with_descendants' : 'spouse_without_descendants')
  }

  let motherShare = 0
  if (mother) {
    if (hasChildren || siblings >= 2) {
      motherShare = 1 / 6
      method.push(hasChildren ? 'mother_one_sixth_children' : 'mother_one_sixth_siblings')
    } else if (father) {
      // In the two 'Umariyyatayn' cases the mother gets one third of the residue
      // after the spouse, rather than one third of the whole estate.
      motherShare = (1 - spouseShare) / 3
      method.push('mother_one_third_residue_with_father')
    } else {
      motherShare = 1 / 3
      method.push('mother_one_third')
    }
    rows.push({ heir: 'mother', count: 1, fraction: motherShare })
  }

  let fatherShare = 0
  if (father && hasChildren) {
    fatherShare = 1 / 6
    method.push('father_one_sixth_with_descendants')
    rows.push({ heir: 'father', count: 1, fraction: fatherShare })
  }

  let childShare = 0
  if (daughters > 0 && sons === 0) {
    childShare = daughters === 1 ? 1 / 2 : 2 / 3
    rows.push({ heir: 'daughters', count: daughters, fraction: childShare })
    method.push(daughters === 1 ? 'one_daughter_fixed_half' : 'daughters_collective_two_thirds')
  }

  const fixedTotal = rows.reduce((sum, row) => sum + row.fraction, 0)
  if (fixedTotal > 1 + 1e-9) {
    // Awl: proportionally reduce fixed shares when their total exceeds the estate.
    for (const row of rows) row.fraction /= fixedTotal
    method.push('awl_proportional_adjustment')
  } else {
    let residue = Math.max(0, 1 - fixedTotal)
    if (sons > 0) {
      const units = sons * 2 + daughters
      rows.push({ heir: 'sons', count: sons, fraction: residue * (sons * 2) / units })
      if (daughters > 0) rows.push({ heir: 'daughters', count: daughters, fraction: residue * daughters / units })
      residue = 0
      method.push('children_residue_two_to_one')
    } else if (father && hasChildren) {
      const row = rows.find((item) => item.heir === 'father')
      if (row) row.fraction += residue
      residue = 0
      method.push('father_residuary_after_daughters')
    } else if (father && !hasChildren) {
      rows.push({ heir: 'father', count: 1, fraction: residue })
      residue = 0
      method.push('father_residuary')
    }

    if (residue > 1e-9) {
      // Radd in this limited model: return residue proportionally to eligible
      // non-spouse fixed-share heirs. Spouses do not participate in radd.
      const eligible = rows.filter((row) => row.heir !== 'wives' && row.heir !== 'husband')
      const eligibleTotal = eligible.reduce((sum, row) => sum + row.fraction, 0)
      if (eligibleTotal > 0) {
        for (const row of eligible) row.fraction += residue * row.fraction / eligibleTotal
        residue = 0
        method.push('radd_to_non_spouse_fixed_heirs')
      } else if (close(residue, 0)) {
        residue = 0
      }
    }
    if (mother && !father && !hasChildren && siblings === 0 && spouseCount > 0 && residue > 1e-9) {
      // Mother is the only modeled non-spouse heir in this supported case.
      const row = rows.find((item) => item.heir === 'mother')
      if (row) row.fraction += residue
      residue = 0
      method.push('radd_to_mother')
    }
    if (residue > 1e-7) throw new Error('unsupported_residue')
  }

  return { area, rows, method, remaining: 0 }
}

function InheritanceCalculator({ bangla }: Props) {
  const [areaText, setAreaText] = useState('10')
  const [deceased, setDeceased] = useState<'man' | 'woman'>('man')
  const [spousesText, setSpousesText] = useState('1')
  const [sonsText, setSonsText] = useState('1')
  const [daughtersText, setDaughtersText] = useState('1')
  const [father, setFather] = useState(false)
  const [mother, setMother] = useState(false)
  const [siblingsText, setSiblingsText] = useState('0')
  const [noOtherHeirs, setNoOtherHeirs] = useState(false)
  const [noPredeceasedChild, setNoPredeceasedChild] = useState(false)
  const [result, setResult] = useState<Calculation | null>(null)
  const [error, setError] = useState('')

  const text = bangla
    ? {
        title: 'উত্তরাধিকার জমি হিসাব', subtitle: 'বাংলাদেশের মুসলিম উত্তরাধিকার আইনের সীমিত প্রোটোটাইপ হিসাব।',
        notice: 'এটি পূর্ণাঙ্গ আইনি হিসাব বা বণ্টন সনদ নয়। বর্তমানে শুধু স্বামী/স্ত্রী, ছেলে-মেয়ে, বাবা-মা এবং মায়ের নির্দিষ্ট অংশে প্রভাব ফেলা ভাইবোনের সংখ্যা ধরা হয়। দাদা-দাদি/নানা-নানি, নাতি-নাতনি, ভাইবোনের প্রকৃত অংশ, একাধিক জটিল ওয়ারিশ, উইল, দেনা, মহর, যৌথ মালিকানা এবং অন্যান্য বিশেষ পরিস্থিতি সম্পূর্ণভাবে হিসাব হয় না।',
        religion: 'নিয়মের ধরন', muslim: 'মুসলিম · সীমিত ফারায়েজ', other: 'হিন্দু/খ্রিস্টান/অন্যান্য: এখনো হিসাব সমর্থিত নয়', land: 'মৃত ব্যক্তির নিট উত্তরাধিকারযোগ্য জমি (ডেসিমেল)', deceased: 'মৃত ব্যক্তি', man: 'পুরুষ', woman: 'নারী', spouses: 'জীবিত স্ত্রী/স্ত্রীর সংখ্যা', husband: 'জীবিত স্বামী আছে?', yes: 'হ্যাঁ', no: 'না', sons: 'জীবিত ছেলে', daughters: 'জীবিত মেয়ে', father: 'মৃত ব্যক্তির বাবা জীবিত', mother: 'মৃত ব্যক্তির মা জীবিত', siblings: 'জীবিত ভাই-বোনের সংখ্যা', extras: 'উপরের তালিকার বাইরে কোনো সম্ভাব্য ওয়ারিশ নেই (দাদা-দাদি/নানা-নানি, নাতি-নাতনি ইত্যাদি)।', predeceased: 'মৃত ব্যক্তির আগে কোনো ছেলে বা মেয়ে মারা যাননি।', button: 'ফারায়েজের সীমিত হিসাব দেখুন', result: 'আনুমানিক ভাগের হিসাব', total: 'নিট জমি', each: 'প্রতি জনের আনুমানিক ভাগ', group: 'ওয়ারিশ', count: 'সংখ্যা', share: 'জনপ্রতি অংশ', groupTotal: 'দলগত মোট', fraction: 'ভগ্নাংশ', warning: 'হিসাবটি শুধু স্ক্রিনিং/শিক্ষামূলক। জমির দলিল, প্রকৃত ওয়ারিশ তালিকা, দেনা/মহর/উইল ও প্রযোজ্য ব্যক্তিগত আইন আইনজীবী/কাজী/ভূমি অফিসে যাচাই না করে জমি ভাগ করবেন না।',
      }
    : {
        title: 'Inheritance Land Calculator', subtitle: 'A limited Bangladesh Muslim inheritance (faraid) prototype.',
        notice: 'This is not a complete legal calculation or distribution certificate. It currently models only spouse, sons/daughters, parents, and sibling count for the mother’s fixed share. Grandparents, grandchildren, siblings’ own shares, multiple complex heir combinations, wills, debts, dower, co-ownership, and other special cases are not fully modeled.',
        religion: 'Rule set', muslim: 'Muslim · limited faraid', other: 'Hindu/Christian/other: calculation not supported yet', land: 'Net inheritable land owned by the deceased (decimal)', deceased: 'Deceased person', man: 'Man', woman: 'Woman', spouses: 'Surviving wives', husband: 'Surviving husband?', yes: 'Yes', no: 'No', sons: 'Surviving sons', daughters: 'Surviving daughters', father: 'Deceased’s father is alive', mother: 'Deceased’s mother is alive', siblings: 'Number of surviving siblings', extras: 'There are no potential heirs beyond the fields above (grandparents, grandchildren, etc.).', predeceased: 'No son or daughter died before the deceased.', button: 'Calculate limited faraid estimate', result: 'Estimated share breakdown', total: 'Net estate', each: 'Estimated share per person', group: 'Heir', count: 'Count', share: 'Share per person', groupTotal: 'Group total', fraction: 'Fraction', warning: 'Educational screening only. Do not distribute land based on this estimate. Verify title, complete heir list, debts/dower/will, and applicable personal law with a qualified lawyer, kazi, or land office.',
      }

  const labels: Record<string, string> = bangla
    ? { wives: 'স্ত্রীগণ', husband: 'স্বামী', sons: 'ছেলে', daughters: 'মেয়ে', father: 'বাবা', mother: 'মা' }
    : { wives: 'Wife(s)', husband: 'Husband', sons: 'Son(s)', daughters: 'Daughter(s)', father: 'Father', mother: 'Mother' }

  const calculate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setResult(null)
    setError('')
    const numbers = [areaText, spousesText, sonsText, daughtersText, siblingsText].map(Number)
    const [area, spouses, sons, daughters, siblings] = numbers
    if (!numbers.every(Number.isFinite) || area <= 0 || [spouses, sons, daughters, siblings].some((value) => !Number.isInteger(value) || value < 0)) {
      setError(bangla ? 'জমির পরিমাণ শূন্যের বেশি এবং ওয়ারিশের সংখ্যা শূন্য বা ধনাত্মক পূর্ণসংখ্যা দিন।' : 'Enter land greater than zero and heir counts as non-negative whole numbers.')
      return
    }
    if (!noOtherHeirs || !noPredeceasedChild) {
      setError(bangla ? 'হিসাবের সীমা নিশ্চিত করতে উপরের দুইটি ঘোষণা টিক দিন। অন্য ওয়ারিশ থাকলে এই হিসাব ব্যবহার করবেন না।' : 'Confirm both statements above. Do not use this estimate if other heirs or a predeceased child exist.')
      return
    }
    if (deceased === 'man' && spouses > 4) {
      setError(bangla ? 'স্ত্রীর সংখ্যা ৪-এর বেশি হলে এই সীমিত হিসাব সমর্থিত নয়।' : 'This limited estimate does not support more than four surviving wives.')
      return
    }
    if (deceased === 'woman' && spouses > 1) {
      setError(bangla ? 'একজন মৃত নারীর ক্ষেত্রে স্বামীর সংখ্যা ০ বা ১ দিন।' : 'For a deceased woman, enter 0 or 1 surviving husband.')
      return
    }
    try {
      setResult(calculateShares({ area, deceased, spouses, sons, daughters, father, mother, siblings }))
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : 'unknown'
      setError(code === 'unsupported_sibling_case'
        ? (bangla ? 'সন্তান ও বাবা জীবিত না থাকলে ভাইবোনের অংশ এই সংস্করণে নির্ভরযোগ্যভাবে হিসাব হয় না।' : 'Sibling inheritance when there are no descendants and no father is outside this version.')
        : (bangla ? 'এই ওয়ারিশ-সমন্বয়ের অবশিষ্ট অংশ এই সংস্করণ সমর্থন করে না। পূর্ণ ওয়ারিশ তালিকা নিয়ে আইনজ্ঞের সাহায্য নিন।' : 'This heir combination leaves a share this version cannot safely resolve. Consult a specialist with the complete heir list.'))
    }
  }

  const fmt = (number: number) => new Intl.NumberFormat(bangla ? 'bn-BD' : 'en-BD', { maximumFractionDigits: 4 }).format(number)
  const ratio = (fraction: number) => `${fmt(fraction * 100)}% (${fraction.toFixed(4)} ${bangla ? 'অংশ' : 'share'})`

  return <>
    <section className="page-intro inheritance-intro">
      <div className="eyebrow">BHUMILIPI · PROTOTYPE</div>
      <h1>{text.title}</h1><p>{text.subtitle}</p>
    </section>
    <section className="tool-panel inheritance-panel">
      <div className="inheritance-notice" role="note">{text.notice}</div>
      <form className="inheritance-form" onSubmit={calculate}>
        <label>{text.religion}<select value="muslim" disabled><option value="muslim">{text.muslim}</option><option>{text.other}</option></select></label>
        <label className="inheritance-area-field">{text.land}<input type="number" min="0.001" step="any" value={areaText} onChange={(event) => setAreaText(event.target.value)} required /></label>
        <label>{text.deceased}<select value={deceased} onChange={(event) => { setDeceased(event.target.value as 'man' | 'woman'); setSpousesText(event.target.value === 'woman' ? '1' : '1') }}><option value="man">{text.man}</option><option value="woman">{text.woman}</option></select></label>
        <label>{deceased === 'man' ? text.spouses : text.husband}<input type="number" min="0" max={deceased === 'man' ? 4 : 1} step="1" value={spousesText} onChange={(event) => setSpousesText(event.target.value)} /></label>
        <div className="inheritance-count-grid">
          <label>{text.sons}<input type="number" min="0" step="1" value={sonsText} onChange={(event) => setSonsText(event.target.value)} /></label>
          <label>{text.daughters}<input type="number" min="0" step="1" value={daughtersText} onChange={(event) => setDaughtersText(event.target.value)} /></label>
          <label>{text.siblings}<input type="number" min="0" step="1" value={siblingsText} onChange={(event) => setSiblingsText(event.target.value)} /></label>
        </div>
        <div className="inheritance-checks">
          <label><input type="checkbox" checked={father} onChange={(event) => setFather(event.target.checked)} />{text.father}</label>
          <label><input type="checkbox" checked={mother} onChange={(event) => setMother(event.target.checked)} />{text.mother}</label>
          <label><input type="checkbox" checked={noOtherHeirs} onChange={(event) => setNoOtherHeirs(event.target.checked)} />{text.extras}</label>
          <label><input type="checkbox" checked={noPredeceasedChild} onChange={(event) => setNoPredeceasedChild(event.target.checked)} />{text.predeceased}</label>
        </div>
        <button className="primary-button inheritance-calculate" type="submit">{text.button}</button>
      </form>
      <p className="inheritance-result-note">
        {bangla ? 'তথ্যসূত্র: ' : 'Rule references: '}
        <a href="https://inheritance.gov.bd/index.php?lang=bn" target="_blank" rel="noreferrer">
          {bangla ? 'সরকারি উত্তরাধিকার হিসাব পোর্টাল' : 'Government inheritance calculator'}
        </a>
        {' · '}
        <a href="https://bdlaws.minlaw.gov.bd/act-details-305.html?lang=en" target="_blank" rel="noreferrer">
          {bangla ? 'Muslim Family Laws Ordinance, 1961 (ধারা ৪)' : 'Muslim Family Laws Ordinance, 1961 (section 4)'}
        </a>
      </p>
      {error && <p className="inheritance-error" role="alert">{error}</p>}
      {result && <div className="inheritance-results" aria-live="polite">
        <h2>{text.result}</h2>
        <p>{text.total}: <strong>{fmt(result.area)} decimal</strong></p>
        <div className="inheritance-table-wrap"><table className="inheritance-table">
          <thead><tr><th>{text.group}</th><th>{text.count}</th><th>{text.fraction}</th><th>{text.share}</th><th>{text.groupTotal}</th></tr></thead>
          <tbody>{result.rows.map((row, index) => <tr key={`${row.heir}-${index}`}>
            <td>{labels[row.heir]}</td><td>{row.count}</td><td>{ratio(row.fraction)}</td>
            <td>{fmt(result.area * row.fraction / row.count)} decimal</td><td>{fmt(result.area * row.fraction)} decimal</td>
          </tr>)}</tbody>
        </table></div>
        <p className="inheritance-result-note">{text.warning}</p>
      </div>}
    </section>
  </>
}

export default InheritanceCalculator
