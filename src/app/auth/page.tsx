import { CopyToClipboard } from './CopyToClipboard'

interface AuthPageProps {
  searchParams: {
    code?: string
    [key: string]: string | string[] | undefined
  }
}

const AuthPage = ({ searchParams }: AuthPageProps) => {
  if (!searchParams?.code) {
    return <p>There was an error getting the required code</p>
  }

  return (
    <>
      <p>Please copy the following code back into your chat window:</p>
      <pre>
        <code>{searchParams.code}</code>
      </pre>
      <CopyToClipboard text={searchParams.code} />
    </>
  )
}

export default AuthPage
