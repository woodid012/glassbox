'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function DashboardPage() {
    const router = useRouter()

    useEffect(() => {
        router.replace('/dashboard/key-periods')
    }, [router])

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
            <div className="text-slate-500">Loading...</div>
        </div>
    )
}
