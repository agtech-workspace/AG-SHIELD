import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from '../App'

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

describe('App Component', () => {
  it('should render without crashing', () => {
    const queryClient = createTestQueryClient()
    
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    )
    
    expect(container).toBeInTheDocument()
  })

  it('should render app shell', () => {
    const queryClient = createTestQueryClient()
    
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    )
    
    expect(container.querySelector('.app-shell')).toBeInTheDocument()
  })
})