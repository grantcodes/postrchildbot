'use client'

import { useState } from 'react'

interface CopyToClipboardProps {
  text: string
}

const CopyToClipboard = ({ text }: CopyToClipboardProps) => {
  const [buttonText, setButtonText] = useState('Copy to Clipboard')

  const handleClick = async (e: any): Promise<void> => {
    e.preventDefault()
    try {
      await navigator.clipboard.writeText(text)
      setButtonText('Copied to Clipboard 👍')
    } catch (err) {
      setButtonText('Failed to Copy to Clipboard 👎')
    }
    return
  }

  return (
    <button className="button" onClick={handleClick}>
      {buttonText}
    </button>
  )
}

export { CopyToClipboard }
