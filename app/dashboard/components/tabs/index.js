import KeyPeriodsTab from './KeyPeriodsTab'
import InputsTab from './InputsTab'
import ModulesTab from './ModulesTab'
import CalculationsTab from './CalculationsTab'
import ArrayViewTab from './ArrayViewTab'
import NotesTab from './NotesTab'

export const TAB_CONFIG = [
    { id: 'keyPeriods', label: 'Key Periods', Component: KeyPeriodsTab },
    { id: 'inputs', label: 'Inputs', Component: InputsTab },
    { id: 'modules', label: 'Modules', Component: ModulesTab },
    { id: 'calculations', label: 'Calculations', Component: CalculationsTab },
    { id: 'arrayView', label: 'Array View', Component: ArrayViewTab },
    { id: 'notes', label: 'Notes', Component: NotesTab },
]

export {
    KeyPeriodsTab,
    InputsTab,
    ModulesTab,
    CalculationsTab,
    ArrayViewTab,
    NotesTab
}
