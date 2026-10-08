import { useMemo, useState } from 'react'
import './App.css'

const genres = [
  'Fantasía',
  'Ciencia ficción',
  'Romántica',
  'No ficción',
  'Clásicos',
  'Misterio',
  'Poesía',
  'Ensayo',
]

const bookCatalog = [
  {
    id: 'fire-and-blood',
    title: 'Fire & Blood',
    author: 'George R. R. Martin',
    price: 14.99,
    accent: 'linear-gradient(135deg, #3f4a5a 0%, #8a5a3b 100%)',
    blurb: 'A fierce account of House Targaryen and the dragonlords of old.',
    description:
      'A sweeping, richly detailed chronicle of the Targaryen dynasty, full of intrigue, dragon lore, and unforgettable moments of political tension.',
    rating: 4.8,
    category: 'Ficción',
    format: 'Hardcover',
  },
  {
    id: 'atomic-habits',
    title: 'Atomic Habits',
    author: 'James Clear',
    price: 13.99,
    accent: 'linear-gradient(135deg, #7c5d55 0%, #d9bb8b 100%)',
    blurb: 'Small habits, extraordinary outcomes, and a practical reading rhythm.',
    description:
      'A guide to building systems that endure. Clear blends behavioral science, personal stories, and practical frameworks to make progress feel achievable.',
    rating: 4.9,
    category: 'Autoayuda',
    format: 'Paperback',
  },
  {
    id: 'midnight-library',
    title: 'The Midnight Library',
    author: 'Matt Haig',
    price: 12.99,
    accent: 'linear-gradient(135deg, #2f5d62 0%, #d7c5b0 100%)',
    blurb: 'A luminous story about second chances and choice.',
    description:
      'Between life and death, a library of possible lives reveals the quiet power of ordinary choices and the courage to begin again.',
    rating: 4.7,
    category: 'Ficción',
    format: 'Paperback',
  },
  {
    id: 'book-of-lost-names',
    title: 'The Book of Lost Names',
    author: 'Kristin Harmel',
    price: 13.99,
    accent: 'linear-gradient(135deg, #7b3f3f 0%, #d9c1a5 100%)',
    blurb: 'A historical novel about memory, survival, and identity under pressure.',
    description:
      'A literary wartime story of courage, art, and the quiet resistance of preserving names when the world tries to erase them.',
    rating: 4.8,
    category: 'Histórica',
    format: 'Paperback',
  },
  {
    id: 'silent-patient',
    title: 'The Silent Patient',
    author: 'Alex Michaelides',
    price: 11.99,
    accent: 'linear-gradient(135deg, #4b3d52 0%, #c8b097 100%)',
    blurb: 'A tense psychological thriller that keeps the reader off balance.',
    description:
      'A therapist becomes obsessed with a patient who refuses to speak, and a story unfolds in layers of fear, control, and manipulation.',
    rating: 4.7,
    category: 'Misterio',
    format: 'Hardcover',
  },
  {
    id: 'educated',
    title: 'Educated',
    author: 'Tara Westover',
    price: 15.49,
    accent: 'linear-gradient(135deg, #2f5d62 0%, #e5d4b9 100%)',
    blurb: 'A memoir of transformation, education, and self-reinvention.',
    description:
      'A powerful memoir about escaping a limited world and becoming the architect of a life shaped by reading, resilience, and wisdom.',
    rating: 4.9,
    category: 'Memorias',
    format: 'Paperback',
  },
  {
    id: 'pride-prejudice',
    title: 'Pride & Prejudice',
    author: 'Jane Austen',
    price: 9.99,
    accent: 'linear-gradient(135deg, #7a541f 0%, #d2b489 100%)',
    blurb: 'Sharp wit, romance, and social observation with lasting brilliance.',
    description:
      'A timeless novel of first impressions, class, and human vulnerability, rendered with elegance and unforgettable dialogue.',
    rating: 4.9,
    category: 'Clásicos',
    format: 'Paperback',
  },
]

const categories = [
  { name: 'Ficción', icon: '✦' },
  { name: 'No ficción', icon: '▣' },
  { name: 'Autoayuda', icon: '☼' },
  { name: 'Romance', icon: '♡' },
  { name: 'Infantil', icon: '★' },
  { name: 'Clásicos', icon: '⌂' },
]

const defaultUser = {
  name: '',
  email: '',
  password: '',
  genres: ['Fantasía', 'Ciencia ficción'],
  authors: 'Gabriel García Márquez, Isabel Allende',
  exchangeType: 'ambos',
}

const wizardSteps = [
  {
    title: '¿Qué géneros te gustan más?',
    subtitle: 'Selecciona entre tus favoritos.',
  },
  {
    title: '¿Qué autores te acompañan?',
    subtitle: 'Escribe o elige algunos nombres.',
  },
  {
    title: '¿Cómo prefieres intercambiar?',
    subtitle: 'Define la forma en que quieres mover tus libros.',
  },
]

const formatPrice = (value) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)

function App() {
  const [stage, setStage] = useState('signup')
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(defaultUser)
  const [activeView, setActiveView] = useState('discover')
  const [selectedBook, setSelectedBook] = useState(bookCatalog[2])
  const [wishlistIds, setWishlistIds] = useState([bookCatalog[2].id])
  const [cartItems, setCartItems] = useState([{ ...bookCatalog[0], quantity: 1 }])
  const [user, setUser] = useState(() => {
    if (typeof window === 'undefined') return null
    const saved = window.localStorage.getItem('lectio-user')
    return saved ? JSON.parse(saved) : null
  })

  const wishlistedBooks = useMemo(
    () => bookCatalog.filter((book) => wishlistIds.includes(book.id)),
    [wishlistIds],
  )

  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cartItems],
  )

  const genreToggle = (genre) => {
    setForm((current) => {
      const exists = current.genres.includes(genre)
      return {
        ...current,
        genres: exists
          ? current.genres.filter((item) => item !== genre)
          : [...current.genres, genre],
      }
    })
  }

  const handleCreateAccount = (event) => {
    event.preventDefault()
    setStage('quiz')
  }

  const handleStepAdvance = () => {
    if (step < wizardSteps.length - 1) {
      setStep((current) => current + 1)
      return
    }

    const savedProfile = {
      ...form,
      name: form.name || 'Lectora Lectio',
      email: form.email || 'lector@lectio.co',
    }

    setUser(savedProfile)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('lectio-user', JSON.stringify(savedProfile))
    }
    setStage('dashboard')
    setActiveView('discover')
  }

  const handleOpenBook = (book) => {
    setSelectedBook(book)
    setActiveView('details')
  }

  const toggleWishlist = (bookId) => {
    setWishlistIds((current) =>
      current.includes(bookId)
        ? current.filter((id) => id !== bookId)
        : [...current, bookId],
    )
  }

  const addToCart = (book) => {
    setCartItems((current) => {
      const existing = current.find((item) => item.id === book.id)
      if (existing) {
        return current.map((item) =>
          item.id === book.id ? { ...item, quantity: item.quantity + 1 } : item,
        )
      }
      return [...current, { ...book, quantity: 1 }]
    })
    setActiveView('cart')
  }

  const updateCartQuantity = (bookId, delta) => {
    setCartItems((current) =>
      current
        .map((item) =>
          item.id === bookId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    )
  }

  const renderWizardContent = () => {
    if (step === 0) {
      return (
        <div className="genre-grid">
          {genres.map((genre) => (
            <button
              key={genre}
              type="button"
              className={`chip-option ${form.genres.includes(genre) ? 'selected' : ''}`}
              onClick={() => genreToggle(genre)}
            >
              {genre}
            </button>
          ))}
        </div>
      )
    }

    if (step === 1) {
      return (
        <label className="field field-large">
          <span>Autores preferidos</span>
          <textarea
            value={form.authors}
            onChange={(event) => setForm({ ...form, authors: event.target.value })}
            rows="4"
            placeholder="Ej: Gabriel García Márquez, Isabel Allende, Elena Poniatowska"
          />
        </label>
      )
    }

    return (
      <div className="exchange-options">
        {['solo venta', 'solo intercambio', 'ambos'].map((option) => (
          <button
            key={option}
            type="button"
            className={`option-card ${form.exchangeType === option ? 'selected' : ''}`}
            onClick={() => setForm({ ...form, exchangeType: option })}
          >
            <span>{option === 'solo venta' ? 'Venta' : option === 'solo intercambio' ? 'Intercambio' : 'Venta + intercambio'}</span>
            <small>
              {option === 'solo venta'
                ? 'Quiero vender con facilidad.'
                : option === 'solo intercambio'
                  ? 'Prefiero circular libros.'
                  : 'Puedo vender y cambiar.'}
            </small>
          </button>
        ))}
      </div>
    )
  }

  const renderDiscoverView = () => (
    <>
      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow">Welcome back</p>
          <h1>Keep the story going.</h1>
          <p>
            Explore fresh picks, continue your current reads, and keep every book moving into a new life.
          </p>
          <div className="hero-actions">
            <button type="button" className="primary-btn">Start Reading</button>
            <button type="button" className="secondary-btn">Explore Now</button>
          </div>
        </div>

        <div className="spotlight-card">
          <div className="spotlight-book" style={{ background: bookCatalog[2].accent }}>
            <span>{bookCatalog[2].title}</span>
          </div>
          <div className="spotlight-meta">
            <p className="eyebrow">Continue Reading</p>
            <h3>{bookCatalog[2].title}</h3>
            <small>{bookCatalog[2].author}</small>
            <div className="progress-wrap">
              <div className="progress-bar"><span style={{ width: '68%' }} /></div>
              <strong>68%</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="showcase-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Featured</p>
            <h2>Trending now</h2>
          </div>
          <button type="button" className="ghost-btn">See all</button>
        </div>

        <div className="book-carousel" aria-label="Featured books carousel">
          {bookCatalog.map((book) => (
            <article key={book.id} className="feature-book-card">
              <button type="button" className="feature-cover-button" onClick={() => handleOpenBook(book)}>
                <div className="feature-cover" style={{ background: book.accent }}>
                  <span>{book.title}</span>
                </div>
              </button>

              <div className="feature-info">
                <h3>{book.title}</h3>
                <p>{book.author}</p>
                <small>{book.blurb}</small>
                <div className="tag-row">
                  <span>Best seller</span>
                  <span>New</span>
                </div>
                <div className="feature-price-row">
                  <strong>{formatPrice(book.price)}</strong>
                  <button type="button" onClick={() => addToCart(book)}>Add to cart</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="category-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Browse</p>
            <h2>Categories</h2>
          </div>
        </div>

        <div className="category-grid">
          {categories.map((category) => (
            <div key={category.name} className="category-card">
              <div className="category-icon">{category.icon}</div>
              <span>{category.name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="bestsellers-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Curated shelf</p>
            <h2>Bestsellers & recommendations</h2>
          </div>
          <button type="button" className="ghost-btn">View all</button>
        </div>

        <div className="bestseller-grid">
          {bookCatalog.map((book) => (
            <article key={book.id} className="bestseller-card">
              <button type="button" className="cover-button" onClick={() => handleOpenBook(book)}>
                <div className="bestseller-cover" style={{ background: book.accent }}>
                  <span>{book.title}</span>
                </div>
              </button>

              <div className="bestseller-body">
                <h3>{book.title}</h3>
                <p>{book.author}</p>
                <div className="rating-row">
                  <span>★ {book.rating}</span>
                  <strong>{formatPrice(book.price)}</strong>
                </div>
                <div className="action-row">
                  <button type="button" className="add-btn" onClick={() => addToCart(book)}>Add to cart</button>
                  <button type="button" className="wish-btn" onClick={() => toggleWishlist(book.id)}>
                    {wishlistIds.includes(book.id) ? 'Saved' : 'Wishlist'}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  )

  const renderWishlistView = () => (
    <section className="detail-shell">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Saved</p>
          <h2>Wishlist</h2>
        </div>
      </div>

      {wishlistedBooks.length > 0 ? (
        <div className="wishlist-grid">
          {wishlistedBooks.map((book) => (
            <article key={book.id} className="wishlist-card">
              <div className="wishlist-cover" style={{ background: book.accent }}>
                <span>{book.title}</span>
              </div>
              <div className="wishlist-body">
                <h3>{book.title}</h3>
                <p>{book.author}</p>
                <div className="wishlist-actions">
                  <strong>{formatPrice(book.price)}</strong>
                  <button type="button" className="primary-btn small-btn" onClick={() => addToCart(book)}>Add to cart</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h3>Your wishlist is empty</h3>
          <p>Save the books you love so you can come back later.</p>
        </div>
      )}
    </section>
  )

  const renderCartView = () => (
    <section className="detail-shell cart-shell">
      <div className="section-heading">
        <div>
          <p className="eyebrow">My bag</p>
          <h2>Cart</h2>
        </div>
      </div>

      {cartItems.length > 0 ? (
        <div className="cart-layout">
          <div className="cart-list">
            {cartItems.map((book) => (
              <div key={book.id} className="cart-item">
                <div className="cart-cover" style={{ background: book.accent }}>
                  <span>{book.title}</span>
                </div>
                <div className="cart-details">
                  <h3>{book.title}</h3>
                  <p>{book.author}</p>
                  <strong>{formatPrice(book.price)}</strong>
                </div>
                <div className="quantity-controls">
                  <button type="button" onClick={() => updateCartQuantity(book.id, -1)}>-</button>
                  <span>{book.quantity}</span>
                  <button type="button" onClick={() => updateCartQuantity(book.id, 1)}>+</button>
                </div>
              </div>
            ))}
          </div>

          <aside className="summary-card">
            <h3>Order Summary</h3>
            <div className="summary-row">
              <span>Subtotal</span>
              <strong>{formatPrice(cartTotal)}</strong>
            </div>
            <div className="summary-row">
              <span>Shipping</span>
              <strong>Free</strong>
            </div>
            <div className="summary-row total-row">
              <span>Total</span>
              <strong>{formatPrice(cartTotal)}</strong>
            </div>
            <button type="button" className="primary-btn full-width">Proceed to checkout</button>
          </aside>
        </div>
      ) : (
        <div className="empty-state">
          <h3>Your cart is empty</h3>
          <p>Add a few favorites to continue your next reading ritual.</p>
        </div>
      )}
    </section>
  )

  const renderDetailView = () => (
    <section className="detail-shell">
      <div className="detail-backbar">
        <button type="button" className="secondary-btn" onClick={() => setActiveView('discover')}>← Back to discover</button>
      </div>

      <div className="detail-layout">
        <div className="detail-cover" style={{ background: selectedBook.accent }}>
          <span>{selectedBook.title}</span>
        </div>

        <div className="detail-body">
          <p className="eyebrow">{selectedBook.category}</p>
          <h1>{selectedBook.title}</h1>
          <h3>{selectedBook.author}</h3>

          <div className="detail-meta">
            <span>★ {selectedBook.rating}</span>
            <span>{selectedBook.format}</span>
            <span>{formatPrice(selectedBook.price)}</span>
          </div>

          <p className="detail-description">{selectedBook.description}</p>

          <div className="detail-actions">
            <button type="button" className="primary-btn" onClick={() => addToCart(selectedBook)}>Add to cart</button>
            <button type="button" className="secondary-btn" onClick={() => toggleWishlist(selectedBook.id)}>
              {wishlistIds.includes(selectedBook.id) ? 'Saved to wishlist' : 'Add to wishlist'}
            </button>
          </div>

          <div className="book-facts">
            <div>
              <span>Edition</span>
              <strong>{selectedBook.format}</strong>
            </div>
            <div>
              <span>Availability</span>
              <strong>In stock</strong>
            </div>
            <div>
              <span>Reviews</span>
              <strong>1.4k readers</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  )

  const renderDashboardContent = () => {
    if (activeView === 'wishlist') return renderWishlistView()
    if (activeView === 'cart') return renderCartView()
    if (activeView === 'details') return renderDetailView()
    return renderDiscoverView()
  }

  if (stage === 'dashboard' && user) {
    return (
      <div className="app-shell dashboard-shell">
        <aside className="sidebar">
          <div className="sidebar-brand">
            <div className="brand-mark">L</div>
            <div>
              <p className="eyebrow">Book library</p>
              <h2>LECTIO</h2>
            </div>
          </div>

          <nav className="sidebar-nav" aria-label="Sidebar navigation">
            <button type="button" className={`nav-item ${activeView === 'discover' ? 'active' : ''}`} onClick={() => setActiveView('discover')}>🏠 Discover</button>
            <button type="button" className="nav-item" onClick={() => setActiveView('discover')}>📚 Categories</button>
            <button type="button" className="nav-item" onClick={() => setActiveView('discover')}>🗂️ My Library</button>
            <button type="button" className={`nav-item ${activeView === 'wishlist' ? 'active' : ''}`} onClick={() => setActiveView('wishlist')}>♡ Wishlist</button>
            <button type="button" className={`nav-item ${activeView === 'cart' ? 'active' : ''}`} onClick={() => setActiveView('cart')}>🛒 Cart ({cartItems.length})</button>
            <button type="button" className="nav-item" onClick={() => setActiveView('discover')}>⚙️ Settings</button>
            <button type="button" className="nav-item" onClick={() => setActiveView('discover')}>❔ Help</button>
          </nav>

          <div className="sidebar-card">
            <span className="pill-label">Reading now</span>
            <strong>Tomorrow, and Tomorrow, and Tomorrow</strong>
            <small>Continue your current chapter</small>
          </div>
        </aside>

        <main className="content-panel">
          <header className="topbar">
            <div className="searchbar-wrap">
              <span className="search-icon">⌕</span>
              <input type="text" placeholder="Search book name, author, edition..." />
              <select defaultValue="All categories">
                <option>All categories</option>
                <option>Fiction</option>
                <option>Non-fiction</option>
                <option>Romance</option>
              </select>
            </div>

            <div className="topbar-actions">
              <button type="button" className="icon-button" aria-label="Notifications">🔔</button>
              <div className="profile-menu">
                <div className="avatar">LC</div>
                <span>{user.name || 'Lector'}</span>
                <span className="caret">▾</span>
              </div>
            </div>
          </header>

          {renderDashboardContent()}
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell auth-shell">
      <div className="auth-illustration">
        <div className="brand-badge">LECTIO</div>
        <div className="floating-tag tag-top">Fresh picks ✨</div>
        <div className="floating-tag tag-bottom">Swap &amp; save</div>
        <div className="book-stack">
          <span className="stack-item one" />
          <span className="stack-item two" />
          <span className="stack-item three" />
        </div>
        <div className="quote-panel">
          <span className="mini-label">Community shelf</span>
          <p>“Un libro no termina en ti.”</p>
        </div>
      </div>

      <div className="auth-card">
        {stage === 'signup' ? (
          <>
            <p className="eyebrow">Comienza tu biblioteca</p>
            <h1>Tu próxima gran lectura te está esperando.</h1>
            <p className="welcome-copy">
              Descubre títulos que te enamoran, intercambia lo que ya leíste y crea una biblioteca que se sienta tuya.
            </p>
            <div className="social-proof" aria-label="Community stats">
              <span>4.9/5 comunidad</span>
              <span>12k lectores</span>
              <span>+300 títulos</span>
            </div>
            <form className="auth-form" onSubmit={handleCreateAccount}>
              <label className="field">
                <span>Nombre</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Tu nombre"
                  required
                />
              </label>

              <label className="field">
                <span>Correo</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  placeholder="tu@correo.com"
                  required
                />
              </label>

              <label className="field">
                <span>Contraseña</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  placeholder="••••••••"
                  required
                />
              </label>

              <button type="submit" className="primary-btn full-width">Continuar</button>
            </form>
          </>
        ) : (
          <>
            <div className="wizard-header">
              <p className="eyebrow">Perfil de lectura</p>
              <h1>{wizardSteps[step].title}</h1>
              <p>{wizardSteps[step].subtitle}</p>
            </div>

            <div className="progress-track" aria-label="Paso del cuestionario">
              {wizardSteps.map((item, index) => (
                <span key={item.title} className={index <= step ? 'step-dot active' : 'step-dot'} />
              ))}
            </div>

            <form className="wizard-form" onSubmit={(event) => event.preventDefault()}>
              {renderWizardContent()}

              <div className="wizard-actions">
                {step > 0 && (
                  <button type="button" className="secondary-btn" onClick={() => setStep((current) => current - 1)}>
                    Atrás
                  </button>
                )}
                <button type="button" className="primary-btn" onClick={handleStepAdvance}>
                  {step === wizardSteps.length - 1 ? 'Finalizar' : 'Siguiente'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

export default App
