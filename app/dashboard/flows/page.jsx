'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { ChevronRight, ChevronDown, Search, ArrowDownRight, ArrowUpLeft } from 'lucide-react'
import { useDashboard } from '../context/DashboardContext'
import { calculatePeriodValues, calculateTotal, formatValue } from '@/utils/valueAggregation'

// Ref type badge colors
const REF_COLORS = {
    C: 'bg-green-100 text-green-700 border-green-200',
    R: 'bg-rose-100 text-rose-700 border-rose-200',
    S: 'bg-blue-100 text-blue-700 border-blue-200',
    V: 'bg-blue-100 text-blue-700 border-blue-200',
    L: 'bg-blue-100 text-blue-700 border-blue-200',
    F: 'bg-purple-100 text-purple-700 border-purple-200',
    T: 'bg-slate-100 text-slate-600 border-slate-200',
    I: 'bg-amber-100 text-amber-700 border-amber-200',
    M: 'bg-orange-100 text-orange-700 border-orange-200',
}

function getRefColor(ref) {
    if (!ref) return REF_COLORS.R
    const prefix = ref.charAt(0)
    return REF_COLORS[prefix] || REF_COLORS.R
}

// Extract all refs from a formula string
const REF_REGEX = /\b(R\d+|C\d+\.\d+|S\d+\.\d+|V\d+(?:\.\d+)?|L\d+\.\d+|F\d+(?:\.(?:Start|End|M|Q|Y))?|I\d+|T\.\w+|M\d+\.\d+)\b/g

function extractRefs(formula) {
    if (!formula) return []
    const matches = []
    let m
    REF_REGEX.lastIndex = 0
    while ((m = REF_REGEX.exec(formula)) !== null) {
        if (!matches.includes(m[1])) matches.push(m[1])
    }
    return matches
}

// Resolve a ref string to a display name
function resolveRefName(ref, referenceNameMap, calcMap) {
    if (referenceNameMap[ref]) return referenceNameMap[ref]
    const rMatch = ref.match(/^R(\d+)$/)
    if (rMatch) {
        const calc = calcMap.get(Number(rMatch[1]))
        if (calc) return calc.name
    }
    return ref
}

function RefBadge({ refStr, isModule }) {
    return (
        <span className="inline-flex items-center gap-1">
            <span className={`px-1.5 py-0.5 text-xs font-mono font-semibold rounded border ${getRefColor(refStr)}`}>
                {refStr}
            </span>
            {isModule && (
                <span className="px-1 py-0.5 text-[10px] font-semibold rounded bg-orange-100 text-orange-600 border border-orange-200">
                    MOD
                </span>
            )}
        </span>
    )
}

// Section header for forward mode categories
function SectionHeader({ label, count, color, isExpanded, onClick }) {
    return (
        <div
            className={`flex items-center gap-2 py-2 px-3 cursor-pointer border-b border-slate-200 ${color}`}
            onClick={onClick}
        >
            <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center text-slate-500">
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </span>
            <span className="text-sm font-semibold text-slate-700">{label}</span>
            <span className="text-xs text-slate-400 font-medium">{count}</span>
        </div>
    )
}

// Recursive tree row component
function TreeRow({
    nodeRef,
    calcId,
    name,
    formula,
    value,
    isModule,
    childCount,
    isLeaf,
    isCircular,
    depth,
    direction,
    pathKey,
    getChildren,
    expandFormulaToNames,
    expandedSet,
    toggleExpand,
}) {
    const rowKey = `${pathKey}>${nodeRef}`
    const isExpanded = expandedSet.has(rowKey)
    const canExpand = !isLeaf && !isCircular && childCount > 0

    const children = isExpanded ? getChildren(nodeRef, calcId, rowKey) : []

    return (
        <>
            <div
                className="flex items-center gap-2 py-1.5 px-2 hover:bg-slate-50 cursor-pointer border-b border-slate-100"
                style={{ paddingLeft: depth * 24 + 8 }}
                onClick={() => canExpand && toggleExpand(rowKey)}
            >
                {/* Expand chevron */}
                <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center text-slate-400">
                    {canExpand ? (
                        isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
                    ) : (
                        <span className="w-3.5" />
                    )}
                </span>

                {/* Ref badge */}
                <RefBadge refStr={nodeRef} isModule={isModule} />

                {/* Name */}
                <span className="text-sm text-slate-800 truncate flex-1 min-w-0">
                    {name}
                </span>

                {/* Circular indicator */}
                {isCircular && (
                    <span className="text-[10px] text-red-500 font-medium px-1.5 py-0.5 bg-red-50 rounded border border-red-200">
                        circular
                    </span>
                )}

                {/* Child count */}
                {canExpand && (
                    <span className="text-[10px] text-slate-400 font-medium">
                        {childCount}
                    </span>
                )}

                {/* Value */}
                <span className="text-sm font-mono text-slate-600 text-right w-28 flex-shrink-0">
                    {value}
                </span>
            </div>

            {/* Expanded formula line */}
            {isExpanded && formula && expandFormulaToNames && (
                <div
                    className="text-[11px] font-mono text-slate-400 py-0.5 bg-slate-50/50 border-b border-slate-100 truncate"
                    style={{ paddingLeft: depth * 24 + 36 }}
                    title={expandFormulaToNames(formula)}
                >
                    = {expandFormulaToNames(formula)}
                </div>
            )}

            {/* Children */}
            {isExpanded && children}
        </>
    )
}


export default function FlowsPage() {
    const {
        viewMode,
        appState,
        derived,
    } = useDashboard()

    const {
        inputGlass,
        inputGlassGroups,
        calculations,
        _mRefMap,
        keyPeriods,
        indices,
    } = appState

    const {
        calculationResults,
        calculationTypes,
        referenceMap,
        referenceNameMap,
        viewHeaders,
        expandFormulaToNames,
        autoGeneratedFlags,
        autoGeneratedIndexations,
    } = derived

    // Local state
    const [mode, setMode] = useState('forward')
    const [search, setSearch] = useState('')
    const [expandedSet, setExpandedSet] = useState(new Set())
    const [expandedSections, setExpandedSections] = useState(new Set(['timing', 'inputs']))

    // Toggle expansion of a tree node (one level at a time)
    const toggleExpand = useCallback((rowKey) => {
        setExpandedSet(prev => {
            const next = new Set(prev)
            if (next.has(rowKey)) {
                for (const key of next) {
                    if (key === rowKey || key.startsWith(rowKey + '>')) next.delete(key)
                }
            } else {
                next.add(rowKey)
            }
            return next
        })
    }, [])

    const toggleSection = useCallback((sectionId) => {
        setExpandedSections(prev => {
            const next = new Set(prev)
            if (next.has(sectionId)) next.delete(sectionId)
            else next.add(sectionId)
            return next
        })
    }, [])

    // Build calc map by ID
    const calcMap = useMemo(() => {
        const map = new Map()
        if (calculations) {
            calculations.forEach(c => map.set(c.id, c))
        }
        return map
    }, [calculations])

    // Constants list
    const constants = useMemo(() => {
        if (!inputGlass) return []
        return inputGlass.filter(inp => inp.groupId === 100)
    }, [inputGlass])

    // Build inverted M-ref map: R-ref -> M-ref strings
    const invertedMRefMap = useMemo(() => {
        const inv = new Map()
        if (_mRefMap) {
            for (const [mRef, rRef] of Object.entries(_mRefMap)) {
                if (!inv.has(rRef)) inv.set(rRef, [])
                inv.get(rRef).push(mRef)
            }
        }
        return inv
    }, [_mRefMap])

    // Forward dependency map: ref string -> array of calc IDs that use it
    const forwardDeps = useMemo(() => {
        const deps = new Map()
        if (!calculations) return deps

        calculations.forEach(calc => {
            if (!calc.formula) return
            const refs = extractRefs(calc.formula)
            refs.forEach(ref => {
                let resolvedRef = ref
                if (_mRefMap && _mRefMap[ref]) {
                    resolvedRef = _mRefMap[ref]
                }
                if (!deps.has(resolvedRef)) deps.set(resolvedRef, [])
                if (!deps.get(resolvedRef).includes(calc.id)) {
                    deps.get(resolvedRef).push(calc.id)
                }
                if (resolvedRef !== ref) {
                    if (!deps.has(ref)) deps.set(ref, [])
                    if (!deps.get(ref).includes(calc.id)) {
                        deps.get(ref).push(calc.id)
                    }
                }
            })
        })

        return deps
    }, [calculations, _mRefMap])

    // Upstream dependency map: calc ID -> array of ref strings it depends on
    const upstreamDeps = useMemo(() => {
        const deps = new Map()
        if (!calculations) return deps

        calculations.forEach(calc => {
            if (!calc.formula) {
                deps.set(calc.id, [])
                return
            }
            deps.set(calc.id, extractRefs(calc.formula))
        })

        return deps
    }, [calculations])

    // Build forward mode categories: group all source refs by type
    const forwardCategories = useMemo(() => {
        const flags = []    // F refs
        const indexations = [] // I refs
        const constantItems = [] // C refs
        const values = []   // V refs
        const series = []   // S refs
        const lookups = []  // L refs
        const timeConstants = [] // T refs

        // Collect all refs that have downstream dependents
        const allSourceRefs = new Set()
        for (const key of forwardDeps.keys()) {
            allSourceRefs.add(key)
        }

        // Also add refs from referenceNameMap that might not be in forwardDeps
        // but we want to show them (even with 0 dependents)

        // Flags
        if (autoGeneratedFlags) {
            Object.values(autoGeneratedFlags).forEach(flag => {
                const idMatch = flag.id?.match(/flag_keyperiod_(\d+)/)
                if (!idMatch) return
                const refNum = parseInt(idMatch[1], 10)
                const ref = `F${refNum}`
                const depCount = (forwardDeps.get(ref) || []).length
                // Also count .Start/.End/.M/.Q/.Y variants
                const startDeps = (forwardDeps.get(`${ref}.Start`) || []).length
                const endDeps = (forwardDeps.get(`${ref}.End`) || []).length
                const mDeps = (forwardDeps.get(`${ref}.M`) || []).length
                const qDeps = (forwardDeps.get(`${ref}.Q`) || []).length
                const yDeps = (forwardDeps.get(`${ref}.Y`) || []).length
                const totalDeps = depCount + startDeps + endDeps + mDeps + qDeps + yDeps
                if (totalDeps > 0) {
                    flags.push({ ref, name: flag.name || ref, depCount: totalDeps, value: '-' })
                }
                // Add sub-refs with their own deps
                if (startDeps > 0) flags.push({ ref: `${ref}.Start`, name: `${flag.name || ref} Start`, depCount: startDeps, value: '-' })
                if (endDeps > 0) flags.push({ ref: `${ref}.End`, name: `${flag.name || ref} End`, depCount: endDeps, value: '-' })
                if (mDeps > 0) flags.push({ ref: `${ref}.M`, name: `${flag.name || ref} Months`, depCount: mDeps, value: '-' })
                if (qDeps > 0) flags.push({ ref: `${ref}.Q`, name: `${flag.name || ref} Quarters`, depCount: qDeps, value: '-' })
                if (yDeps > 0) flags.push({ ref: `${ref}.Y`, name: `${flag.name || ref} Years`, depCount: yDeps, value: '-' })
            })
        }

        // Indexations
        if (autoGeneratedIndexations) {
            Object.values(autoGeneratedIndexations).forEach(indexation => {
                const idMatch = indexation.id?.match(/index_(\d+)/)
                if (!idMatch) return
                const refNum = parseInt(idMatch[1], 10)
                const ref = `I${refNum}`
                const depCount = (forwardDeps.get(ref) || []).length
                if (depCount > 0) {
                    indexations.push({ ref, name: indexation.name || ref, depCount, value: '-' })
                }
            })
        }

        // Time constants
        const timeRefs = ['T.DiM', 'T.DiY', 'T.MiY', 'T.QiY', 'T.HiD', 'T.HiY', 'T.MiQ', 'T.DiQ', 'T.QE', 'T.CYE', 'T.FYE']
        timeRefs.forEach(ref => {
            const depCount = (forwardDeps.get(ref) || []).length
            if (depCount > 0) {
                timeConstants.push({ ref, name: referenceNameMap?.[ref] || ref, depCount, value: '-' })
            }
        })

        // Constants
        constants.forEach(c => {
            const ref = `C1.${c.id - 99}`
            const depCount = (forwardDeps.get(ref) || []).length
            constantItems.push({ ref, name: c.name, depCount, value: formatValue(c.value ?? 0) })
        })

        // Values & Series - scan input groups
        if (inputGlassGroups && inputGlass) {
            inputGlassGroups.forEach(group => {
                if (group.id === 100) return // skip constants
                if (group.entryMode === 'lookup' || group.entryMode === 'lookup2') return // handled separately

                const groupInputs = inputGlass.filter(inp => inp.groupId === group.id)
                if (groupInputs.length === 0) return

                // Determine prefix based on mode
                const isValues = group.entryMode === 'values'
                const isSeries = group.entryMode === 'series'

                groupInputs.forEach(input => {
                    // Build ref - need to figure out group ref
                    const groupRef = referenceNameMap ? Object.keys(referenceNameMap).find(key => {
                        const inputNum = group.id === 100 ? input.id - 99 : input.id
                        return key === `V${group.refIndex}.${inputNum}` || key === `S${group.refIndex}.${inputNum}`
                    }) : null

                    let ref = groupRef
                    if (!ref) {
                        // Fallback: try common patterns
                        const inputNum = group.id === 100 ? input.id - 99 : input.id
                        if (isValues) ref = `V${group.refIndex}.${inputNum}`
                        else if (isSeries) ref = `S${group.refIndex}.${inputNum}`
                        else ref = `V${group.refIndex}.${inputNum}`
                    }

                    const depCount = (forwardDeps.get(ref) || []).length
                    const target = isValues ? values : isSeries ? series : values
                    target.push({ ref, name: input.name, depCount, value: '-', groupName: group.name })
                })
            })

            // Lookups
            inputGlassGroups
                .filter(g => g.entryMode === 'lookup' || g.entryMode === 'lookup2')
                .forEach((group, gIdx) => {
                    const lookupRef = `L${group.refIndex}`
                    const groupInputs = inputGlass.filter(inp => inp.groupId === group.id)
                    const subgroups = group.subgroups || []

                    if (subgroups.length === 0) {
                        groupInputs.forEach((input, idx) => {
                            const ref = `${lookupRef}.${idx + 1}`
                            const depCount = (forwardDeps.get(ref) || []).length
                            lookups.push({ ref, name: `${group.name} - ${input.name}`, depCount, value: '-' })
                        })
                    } else {
                        subgroups.forEach((sg, sgIdx) => {
                            const ref = `${lookupRef}.${sgIdx + 1}`
                            const depCount = (forwardDeps.get(ref) || []).length
                            lookups.push({ ref, name: `${group.name} - ${sg.name}`, depCount, value: '-' })
                        })
                    }
                })
        }

        return { flags, indexations, timeConstants, constants: constantItems, values, series, lookups }
    }, [forwardDeps, autoGeneratedFlags, autoGeneratedIndexations, referenceNameMap, constants, inputGlassGroups, inputGlass])

    // Get value display for a ref
    const getRefValue = useCallback((ref) => {
        const rMatch = ref.match(/^R(\d+)$/)
        if (rMatch) {
            const id = Number(rMatch[1])
            const result = calculationResults?.[`R${id}`]
            if (result && Array.isArray(result)) {
                const calcType = calculationTypes?.[id] || 'flow'
                const periodValues = calculatePeriodValues(result, viewHeaders, viewMode, calcType)
                const total = calculateTotal(periodValues, calcType)
                return formatValue(total, { compact: true })
            }
            return '-'
        }

        const cMatch = ref.match(/^C(\d+)\.(\d+)$/)
        if (cMatch) {
            const constId = 99 + Number(cMatch[2])
            const inp = inputGlass?.find(i => i.id === constId && i.groupId === 100)
            if (inp) return formatValue(inp.value ?? 0)
            return '-'
        }

        if (referenceMap?.[ref] && Array.isArray(referenceMap[ref])) {
            const arr = referenceMap[ref]
            const periodValues = calculatePeriodValues(arr, viewHeaders, viewMode, 'flow')
            const total = calculateTotal(periodValues, 'flow')
            return formatValue(total, { compact: true })
        }

        const mMatch = ref.match(/^M(\d+)\.(\d+)$/)
        if (mMatch && _mRefMap?.[ref]) {
            return getRefValue(_mRefMap[ref])
        }

        return '-'
    }, [calculationResults, calculationTypes, viewHeaders, viewMode, inputGlass, referenceMap, _mRefMap])

    // Get name for a ref
    const getRefName = useCallback((ref) => {
        return resolveRefName(ref, referenceNameMap || {}, calcMap)
    }, [referenceNameMap, calcMap])

    // Check if a ref is a module calc
    const isModuleCalc = useCallback((ref) => {
        const rMatch = ref.match(/^R(\d+)$/)
        if (rMatch) {
            const calc = calcMap.get(Number(rMatch[1]))
            return calc?._moduleId != null
        }
        return ref.startsWith('M')
    }, [calcMap])

    // Forward mode: get children for a ref
    const getForwardChildren = useCallback((nodeRef, calcId, pathKey) => {
        let rRef = nodeRef
        if (calcId != null) rRef = `R${calcId}`

        let depCalcIds = forwardDeps.get(rRef) || []
        const mRefs = invertedMRefMap.get(rRef) || []
        for (const mRef of mRefs) {
            const mDeps = forwardDeps.get(mRef) || []
            depCalcIds = [...depCalcIds, ...mDeps.filter(id => !depCalcIds.includes(id))]
        }

        return depCalcIds.map(id => {
            const calc = calcMap.get(id)
            if (!calc) return null
            const ref = `R${id}`
            const childPath = `${pathKey}>${ref}`
            const pathRefs = pathKey.split('>').filter(Boolean)
            const isCircular = pathRefs.includes(ref)
            const childDeps = forwardDeps.get(ref) || []
            const childMRefs = invertedMRefMap.get(ref) || []
            let childCount = childDeps.length
            for (const mRef of childMRefs) {
                childCount += (forwardDeps.get(mRef) || []).length
            }

            return (
                <TreeRow
                    key={childPath}
                    nodeRef={ref}
                    calcId={id}
                    name={calc.name}
                    formula={calc.formula}
                    value={getRefValue(ref)}
                    isModule={calc._moduleId != null}
                    childCount={childCount}
                    isLeaf={childCount === 0}
                    isCircular={isCircular}
                    depth={(pathKey.split('>').length)}
                    direction="forward"
                    pathKey={pathKey}
                    getChildren={getForwardChildren}
                    expandFormulaToNames={expandFormulaToNames}
                    expandedSet={expandedSet}
                    toggleExpand={toggleExpand}
                />
            )
        }).filter(Boolean)
    }, [forwardDeps, invertedMRefMap, calcMap, getRefValue, expandFormulaToNames, expandedSet, toggleExpand])

    // Reverse mode: get children (upstream deps) for a calc
    const getReverseChildren = useCallback((nodeRef, calcId, pathKey) => {
        let refs = []
        if (calcId != null) {
            refs = upstreamDeps.get(calcId) || []
        } else {
            const rMatch = nodeRef.match(/^R(\d+)$/)
            if (rMatch) refs = upstreamDeps.get(Number(rMatch[1])) || []
        }

        return refs.map(ref => {
            const childPath = `${pathKey}>${ref}`
            const pathRefs = pathKey.split('>').filter(Boolean)
            const isCircular = pathRefs.includes(ref)

            let resolvedRef = ref
            let resolvedCalcId = null
            if (_mRefMap?.[ref]) {
                resolvedRef = _mRefMap[ref]
            }
            const rMatch = resolvedRef.match(/^R(\d+)$/)
            if (rMatch) {
                resolvedCalcId = Number(rMatch[1])
            }

            const calc = resolvedCalcId != null ? calcMap.get(resolvedCalcId) : null
            const name = calc?.name || getRefName(ref)
            const formula = calc?.formula || null
            const isLeaf = resolvedCalcId == null || (upstreamDeps.get(resolvedCalcId) || []).length === 0
            const childCount = resolvedCalcId != null ? (upstreamDeps.get(resolvedCalcId) || []).length : 0

            return (
                <TreeRow
                    key={childPath}
                    nodeRef={ref}
                    calcId={resolvedCalcId}
                    name={name}
                    formula={formula}
                    value={getRefValue(resolvedRef)}
                    isModule={isModuleCalc(ref)}
                    childCount={childCount}
                    isLeaf={isLeaf}
                    isCircular={isCircular}
                    depth={(pathKey.split('>').length)}
                    direction="reverse"
                    pathKey={pathKey}
                    getChildren={getReverseChildren}
                    expandFormulaToNames={expandFormulaToNames}
                    expandedSet={expandedSet}
                    toggleExpand={toggleExpand}
                />
            )
        })
    }, [upstreamDeps, _mRefMap, calcMap, getRefName, getRefValue, isModuleCalc, expandFormulaToNames, expandedSet, toggleExpand])

    // Search filtering
    const searchLower = search.toLowerCase()

    const filterItems = useCallback((items) => {
        if (!search) return items
        return items.filter(item =>
            item.name.toLowerCase().includes(searchLower) || item.ref.toLowerCase().includes(searchLower)
        )
    }, [search, searchLower])

    const filteredCalcs = useMemo(() => {
        if (!calculations) return []
        return calculations.filter(c => {
            if (!search) return true
            const ref = `R${c.id}`
            return c.name?.toLowerCase().includes(searchLower) || ref.toLowerCase().includes(searchLower)
        })
    }, [calculations, searchLower])

    // Reset expansion when mode changes
    const handleModeChange = useCallback((newMode) => {
        setMode(newMode)
        setExpandedSet(new Set())
    }, [])

    // Render a forward-mode item as a TreeRow at depth 1
    const renderForwardItem = useCallback((item) => {
        const depCount = (forwardDeps.get(item.ref) || []).length
        return (
            <TreeRow
                key={item.ref}
                nodeRef={item.ref}
                calcId={null}
                name={item.name}
                formula={null}
                value={item.value}
                isModule={false}
                childCount={depCount}
                isLeaf={depCount === 0}
                isCircular={false}
                depth={2}
                direction="forward"
                pathKey=""
                getChildren={getForwardChildren}
                expandFormulaToNames={expandFormulaToNames}
                expandedSet={expandedSet}
                toggleExpand={toggleExpand}
            />
        )
    }, [forwardDeps, getForwardChildren, expandFormulaToNames, expandedSet, toggleExpand])

    // Forward top-level groups with sub-sections
    const forwardGroups = useMemo(() => [
        {
            id: 'timing',
            label: 'Timing',
            color: 'bg-purple-50 hover:bg-purple-100/60',
            subSections: [
                { id: 'flags', label: 'Flags', items: forwardCategories.flags },
                { id: 'indexations', label: 'Indexation', items: forwardCategories.indexations },
                { id: 'time', label: 'Time Constants', items: forwardCategories.timeConstants },
            ],
        },
        {
            id: 'inputs',
            label: 'Inputs',
            color: 'bg-blue-50 hover:bg-blue-100/60',
            subSections: [
                { id: 'constants', label: 'Constants', items: forwardCategories.constants },
                { id: 'values', label: 'Values (CAPEX)', items: forwardCategories.values },
                { id: 'series', label: 'Series (OPEX)', items: forwardCategories.series },
                { id: 'lookups', label: 'Lookups', items: forwardCategories.lookups },
            ],
        },
    ], [forwardCategories])

    return (
        <div className="max-w-[1800px] mx-auto px-6 py-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h1 className="text-xl font-bold text-slate-900">Flows</h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        {mode === 'forward'
                            ? 'Trace how inputs flow downstream into calculations'
                            : 'Trace any calculation upstream to its source inputs'}
                    </p>
                </div>

                {/* Mode toggle */}
                <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                    <button
                        onClick={() => handleModeChange('forward')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${
                            mode === 'forward'
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                        }`}
                    >
                        <ArrowDownRight className="w-3.5 h-3.5" />
                        Forward Flow
                    </button>
                    <button
                        onClick={() => handleModeChange('reverse')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${
                            mode === 'reverse'
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                        }`}
                    >
                        <ArrowUpLeft className="w-3.5 h-3.5" />
                        Reverse Flow
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder={mode === 'forward' ? 'Filter inputs by name or ref...' : 'Filter calculations by name or ref...'}
                    className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                />
            </div>

            {/* Column headers */}
            <div className="flex items-center gap-2 py-2 px-2 bg-slate-50 border-b border-slate-200 rounded-t-lg text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <span className="w-4 flex-shrink-0" />
                <span className="w-20">Ref</span>
                <span className="flex-1">Name</span>
                <span className="w-28 text-right">Value</span>
            </div>

            {/* Tree content */}
            <div className="border border-slate-200 border-t-0 rounded-b-lg bg-white max-h-[calc(100vh-280px)] overflow-y-auto">
                {mode === 'forward' ? (
                    // Forward mode: two-tier grouped categories
                    forwardGroups.map(group => {
                        const totalItems = group.subSections.reduce((sum, sub) => sum + filterItems(sub.items).length, 0)
                        if (totalItems === 0 && search) return null
                        const isGroupOpen = expandedSections.has(group.id)

                        return (
                            <div key={group.id}>
                                <SectionHeader
                                    label={group.label}
                                    count={totalItems}
                                    color={group.color}
                                    isExpanded={isGroupOpen}
                                    onClick={() => toggleSection(group.id)}
                                />
                                {isGroupOpen && group.subSections.map(sub => {
                                    const filtered = filterItems(sub.items)
                                    if (filtered.length === 0 && search) return null
                                    const isSubOpen = expandedSections.has(sub.id)

                                    return (
                                        <div key={sub.id}>
                                            <div
                                                className="flex items-center gap-2 py-1.5 px-2 cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                                                style={{ paddingLeft: 32 }}
                                                onClick={() => toggleSection(sub.id)}
                                            >
                                                <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center text-slate-400">
                                                    {isSubOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                                </span>
                                                <span className="text-sm font-medium text-slate-600">{sub.label}</span>
                                                <span className="text-[10px] text-slate-400 font-medium">{filtered.length}</span>
                                            </div>
                                            {isSubOpen && filtered.map(item => renderForwardItem(item))}
                                        </div>
                                    )
                                })}
                            </div>
                        )
                    })
                ) : (
                    // Reverse mode: calculations as root
                    filteredCalcs.length === 0 ? (
                        <div className="py-8 text-center text-sm text-slate-400">No calculations found</div>
                    ) : (
                        filteredCalcs.map(calc => {
                            const ref = `R${calc.id}`
                            const upCount = (upstreamDeps.get(calc.id) || []).length

                            return (
                                <TreeRow
                                    key={ref}
                                    nodeRef={ref}
                                    calcId={calc.id}
                                    name={calc.name}
                                    formula={calc.formula}
                                    value={getRefValue(ref)}
                                    isModule={calc._moduleId != null}
                                    childCount={upCount}
                                    isLeaf={upCount === 0}
                                    isCircular={false}
                                    depth={0}
                                    direction="reverse"
                                    pathKey=""
                                    getChildren={getReverseChildren}
                                    expandFormulaToNames={expandFormulaToNames}
                                    expandedSet={expandedSet}
                                    toggleExpand={toggleExpand}
                                />
                            )
                        })
                    )
                )}
            </div>

            {/* Summary */}
            <div className="mt-2 text-xs text-slate-400">
                {mode === 'forward'
                    ? `${Object.values(forwardCategories).flat().length} source refs`
                    : `${filteredCalcs.length} calculations${search ? ` (filtered from ${calculations?.length || 0})` : ''}`}
            </div>
        </div>
    )
}
