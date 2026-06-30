import { Suspense } from "react"
import InscriptionForm from "./InscriptionForm"

export const metadata = { title: "Inscription · Inaya Immo" }

export default function InscriptionPage() {
  return (
    <Suspense>
      <InscriptionForm />
    </Suspense>
  )
}
