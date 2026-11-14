'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Book = {
  id: string;
  title: string;
  author: string;
  category: string;
  description: string;
  cover_url?: string;
  rating: number;
  rating_count?: number;
  available_copies: number;
  total_copies: number;
};

type Rental = {
  id: string;
  book_id: string;
  book_title: string;
  borrower_name: string;
  rented_at: string;
  due_date: string;
  returned: boolean;
};

const CATEGORIES = [
  'All',
  'Action',
  'Romance',
  'Horror',
  'Sci-Fi',
  'Fantasy',
  'Fiction',
  'Non-Fiction',
  'History',
  'Educational',
  "Children's Book",
];

export default function BookRentalApp() {
  const [books, setBooks] = useState<Book[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentYear, setCurrentYear] = useState(2026);

  // View tabs for owner ("catalog" or "rentals")
  const [ownerTab, setOwnerTab] = useState<'catalog' | 'rentals'>('catalog');

  // Selected Book Modal (for viewing details, rating, and renting)
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [userRating, setUserRating] = useState<number>(5);

  // Borrower Name Modal State
  const [showBorrowModal, setShowBorrowModal] = useState(false);
  const [borrowerName, setBorrowerName] = useState('');
  const [bookToRent, setBookToRent] = useState<Book | null>(null);

  // Owner Mode & Modals
  const [isOwner, setIsOwner] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [pinInput, setPinInput] = useState('');

  // New Book Form State
  const [newTitle, setNewTitle] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [newCategory, setNewCategory] = useState('Action');
  const [newCoverUrl, setNewCoverUrl] = useState('');
  const [newDescription, setNewDescription] = useState('');

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());
    fetchBooks();
    fetchRentals();
  }, []);

  async function fetchBooks() {
    const { data, error } = await supabase.from('books').select('*').order('title');
    if (error) {
      console.error('Error fetching books:', error.message);
    } else if (data) {
      setBooks(data);
      if (selectedBook) {
        const updated = data.find((b) => b.id === selectedBook.id);
        if (updated) setSelectedBook(updated);
      }
    }
  }

  async function fetchRentals() {
    const { data, error } = await supabase
      .from('rentals')
      .select('*')
      .eq('returned', false)
      .order('due_date', { ascending: true });
    if (error) {
      console.error('Error fetching rentals:', error.message);
    } else if (data) {
      setRentals(data);
    }
  }

  // Initiate Rental Process
  function handleRentClick(book: Book) {
    if (book.available_copies <= 0) return alert('Sorry, this book is currently rented out!');
    setBookToRent(book);
    setBorrowerName('');
    setShowBorrowModal(true);
  }

  // Confirm Rental with Borrower Name (Fixed with full refetch sync)
  async function confirmRental(e: React.FormEvent) {
    e.preventDefault();
    if (!borrowerName.trim() || !bookToRent) return alert('Please enter the borrower name.');
    setLoading(true);

    // Calculate due date (7 days from now)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    // 1. Update book availability to 0 in Supabase
    const { error: bookError } = await supabase
      .from('books')
      .update({ available_copies: 0 })
      .eq('id', bookToRent.id);

    if (bookError) {
      alert('Error updating book availability: ' + bookError.message);
      setLoading(false);
      return;
    }

    // 2. Insert into rentals log table
    const { error: rentalError } = await supabase.from('rentals').insert([
      {
        book_id: bookToRent.id,
        book_title: bookToRent.title,
        borrower_name: borrowerName.trim(),
        due_date: dueDate.toISOString(),
        returned: false,
      },
    ]);

    if (rentalError) {
      alert('Error recording rental: ' + rentalError.message);
    } else {
      alert(`Success! "${bookToRent.title}" rented to ${borrowerName.trim()}. Due in 7 days.`);
      setShowBorrowModal(false);
      setSelectedBook(null);

      // Refresh data from Supabase to guarantee state sync across catalog and rentals
      await fetchBooks();
      await fetchRentals();
    }
    setLoading(false);
  }

  // Return Book (Mark as Returned & restock)
  async function handleReturnBook(rental: Rental) {
    setLoading(true);

    // 1. Mark rental as returned
    const { error: rentalError } = await supabase
      .from('rentals')
      .update({ returned: true })
      .eq('id', rental.id);

    if (rentalError) {
      alert('Error updating rental record: ' + rentalError.message);
      setLoading(false);
      return;
    }

    // 2. Restock the book copy back to 1
    const { error: bookError } = await supabase
      .from('books')
      .update({ available_copies: 1 })
      .eq('id', rental.book_id);

    if (bookError) {
      alert('Error restocking book: ' + bookError.message);
    } else {
      alert(`"${rental.book_title}" has been returned and restocked!`);
      await fetchBooks();
      await fetchRentals();
    }
    setLoading(false);
  }

  async function handleRateBook(book: Book, stars: number) {
    setLoading(true);
    const currentCount = book.rating_count || 0;
    const currentRating = book.rating || 0;
    const newCount = currentCount + 1;
    const updatedAverage = Number(((currentRating * currentCount + stars) / newCount).toFixed(1));

    const { error } = await supabase
      .from('books')
      .update({ rating: updatedAverage, rating_count: newCount })
      .eq('id', book.id);

    if (error) {
      alert('Could not submit rating: ' + error.message);
    } else {
      await fetchBooks();
    }
    setLoading(false);
  }

  async function handleAddBook(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle || !newAuthor) return alert('Please enter both the book title and author.');

    setLoading(true);
    const { error } = await supabase.from('books').insert([
      {
        title: newTitle,
        author: newAuthor,
        category: newCategory,
        cover_url: newCoverUrl.trim() || 'https://covers.openlibrary.org/b/isbn/9780439023481-L.jpg',
        description: newDescription || 'No synopsis provided yet.',
        rating: 0,
        rating_count: 0,
        total_copies: 1,
        available_copies: 1,
      },
    ]);

    if (error) {
      alert('Error adding book: ' + error.message);
    } else {
      setNewTitle('');
      setNewAuthor('');
      setNewCoverUrl('');
      setNewDescription('');
      setShowAddModal(false);
      await fetchBooks();
    }
    setLoading(false);
  }

  function handleOwnerLogin(e: React.FormEvent) {
    e.preventDefault();
    if (pinInput === 'admin123') {
      setIsOwner(true);
      setPinInput('');
      setShowPinModal(false);
    } else {
      alert('Incorrect Librarian PIN.');
    }
  }

  const filteredBooks = books.filter((book) => {
    const matchesCategory =
      selectedCategory === 'All' ||
      book.category?.toLowerCase() === selectedCategory.toLowerCase();
    const matchesSearch =
      book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      book.author.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white border-b border-blue-100 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-lg shadow-sm shadow-blue-600/30">
              B
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight text-blue-950">
                BlueShelf
              </span>
              <span className="hidden sm:inline-block ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                Book Rental
              </span>
            </div>
          </div>

          <div className="flex-1 max-w-md hidden md:block">
            <input
              type="text"
              placeholder="Search 100+ titles or authors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-100 border border-slate-200 rounded-full px-4 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-blue-500 transition-all"
            />
          </div>

          <div className="flex items-center gap-2">
            {isOwner ? (
              <>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-3.5 py-1.5 text-xs font-bold rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors cursor-pointer"
                >
                  + Add Book
                </button>
                <button
                  onClick={() => setIsOwner(false)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                >
                  Logout
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowPinModal(true)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-full text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
              >
                Staff Portal
              </button>
            )}
          </div>
        </div>

        {/* Category Strip */}
        <div className="bg-white border-t border-slate-100">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
              {CATEGORIES.map((cat) => {
                const active = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => {
                      setSelectedCategory(cat);
                      if (isOwner) setOwnerTab('catalog');
                    }}
                    className={`px-3 py-2.5 text-xs sm:text-sm font-bold whitespace-nowrap border-b-2 transition-all cursor-pointer ${
                      active && (!isOwner || ownerTab === 'catalog')
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-500 hover:text-blue-600'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            {isOwner && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setOwnerTab('catalog')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    ownerTab === 'catalog'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Catalog
                </button>
                <button
                  onClick={() => setOwnerTab('rentals')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    ownerTab === 'rentals'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Active Rentals ({rentals.length})
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 flex-1">
        <div className="mb-6 md:hidden">
          <input
            type="text"
            placeholder="Search 100+ titles or authors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500"
          />
        </div>

        {isOwner && ownerTab === 'rentals' ? (
          /* Librarian Active Rentals Dashboard */
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                Active Borrower Rentals
              </h2>
              <span className="text-xs font-semibold text-slate-500">
                {rentals.length} active {rentals.length === 1 ? 'rental' : 'rentals'}
              </span>
            </div>

            {rentals.length === 0 ? (
              <div className="bg-white border border-blue-100 rounded-2xl p-12 text-center shadow-xs">
                <p className="text-sm font-bold text-slate-700">No active rentals right now.</p>
                <p className="text-xs text-slate-400 mt-1">All single copies are currently on shelves.</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">
                        <th className="p-4">Book Title</th>
                        <th className="p-4">Borrower Name</th>
                        <th className="p-4">Rented Date</th>
                        <th className="p-4">Due Date</th>
                        <th className="p-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                      {rentals.map((rental) => {
                        const isOverdue = new Date() > new Date(rental.due_date);
                        return (
                          <tr key={rental.id} className="hover:bg-slate-50/80">
                            <td className="p-4 font-bold text-slate-900">{rental.book_title}</td>
                            <td className="p-4 font-semibold text-blue-600">{rental.borrower_name}</td>
                            <td className="p-4 text-slate-500">
                              {new Date(rental.rented_at).toLocaleDateString()}
                            </td>
                            <td className="p-4">
                              <span
                                className={`px-2.5 py-1 rounded-md font-bold text-xs ${
                                  isOverdue
                                    ? 'bg-rose-100 text-rose-700'
                                    : 'bg-amber-50 text-amber-700'
                                }`}
                              >
                                {new Date(rental.due_date).toLocaleDateString()}
                              </span>
                            </td>
                            <td className="p-4 text-right">
                              <button
                                disabled={loading}
                                onClick={() => handleReturnBook(rental)}
                                className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors cursor-pointer"
                              >
                                Mark Returned
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Book Catalog Grid */
          <>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                {selectedCategory === 'All' ? 'Complete 100-Title Library' : `${selectedCategory}`}
              </h2>
              <span className="text-xs font-semibold text-slate-500">
                {filteredBooks.length} {filteredBooks.length === 1 ? 'title' : 'titles'} (Single Copy)
              </span>
            </div>

            {filteredBooks.length === 0 ? (
              <div className="bg-white border border-blue-100 rounded-2xl p-12 text-center shadow-xs">
                <p className="text-sm font-bold text-slate-700">No books found in this genre.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6">
                {filteredBooks.map((book) => {
                  const isAvailable = book.available_copies > 0;
                  return (
                    <div
                      key={book.id}
                      onClick={() => setSelectedBook(book)}
                      className="group bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs hover:shadow-md hover:border-blue-300 transition-all flex flex-col cursor-pointer"
                    >
                      <div className="relative aspect-[3/4] w-full bg-slate-900 overflow-hidden">
                        <img
                          src={book.cover_url}
                          alt={book.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />

                        <div className="absolute top-2.5 left-2.5">
                          <span
                            className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wide shadow-sm ${
                              isAvailable
                                ? 'bg-emerald-500 text-white'
                                : 'bg-rose-600 text-white'
                            }`}
                          >
                            {isAvailable ? 'Available (1/1)' : 'Rented Out'}
                          </span>
                        </div>

                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 via-slate-950/40 to-transparent p-3 flex items-center justify-between text-white">
                          <span className="text-[11px] font-bold text-sky-300 truncate max-w-[65%]">
                            {book.category || 'General'}
                          </span>
                          <div className="flex items-center gap-1 text-xs font-extrabold text-amber-300">
                            <span>★</span>
                            <span>{book.rating && book.rating > 0 ? book.rating.toFixed(1) : 'New'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="p-3.5 flex-1 flex flex-col justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                            {book.title}
                          </h3>
                          <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{book.author}</p>
                          <p className="text-xs text-slate-500 line-clamp-2 mt-1.5 leading-relaxed">
                            {book.description || 'Click to view details and borrow this book.'}
                          </p>
                        </div>

                        <button
                          disabled={loading || !isAvailable}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRentClick(book);
                          }}
                          className="mt-2 w-full py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-200 disabled:text-slate-400"
                        >
                          {isAvailable ? 'Rent Now' : 'Rented Out'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200/80 py-6 px-4 sm:px-6 mt-12">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
          <p>© {currentYear} BlueShelf Book Rental</p>
          {!isOwner && (
            <button
              onClick={() => setShowPinModal(true)}
              className="hover:text-blue-600 transition-colors cursor-pointer"
            >
              Librarian Access
            </button>
          )}
        </div>
      </footer>

      {/* Borrower Name Prompt Modal */}
      {showBorrowModal && bookToRent && (
        <div
          onClick={() => setShowBorrowModal(false)}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-blue-100 rounded-2xl max-w-sm w-full p-6 shadow-2xl"
          >
            <div className="flex justify-between items-center mb-3 border-b border-slate-100 pb-2">
              <h3 className="text-sm font-extrabold text-blue-950">Confirm Book Rental</h3>
              <button
                onClick={() => setShowBorrowModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              You are renting: <strong className="text-slate-800">{bookToRent.title}</strong> (Due in 7 days).
            </p>
            <form onSubmit={confirmRental} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700">Borrower Full Name *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={borrowerName}
                  onChange={(e) => setBorrowerName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                Complete Rental
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Librarian PIN Modal */}
      {showPinModal && (
        <div
          onClick={() => setShowPinModal(false)}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-blue-100 rounded-2xl max-w-xs w-full p-6 shadow-2xl"
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-extrabold text-blue-950">Librarian Verification</h3>
              <button
                onClick={() => setShowPinModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleOwnerLogin} className="flex flex-col gap-3">
              <input
                type="password"
                autoFocus
                placeholder="Enter Owner PIN..."
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer"
              >
                Unlock Owner Mode
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Book Details Modal */}
      {selectedBook && (
        <div
          onClick={() => setSelectedBook(null)}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-blue-100"
          >
            <div className="bg-blue-600 p-5 text-white flex justify-between items-start">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full">
                  {selectedBook.category || 'General'}
                </span>
                <h2 className="text-xl font-black mt-2">{selectedBook.title}</h2>
                <p className="text-xs text-blue-100 mt-0.5">By {selectedBook.author}</p>
              </div>
              <button
                onClick={() => setSelectedBook(null)}
                className="text-white/80 hover:text-white font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 flex flex-col gap-5">
              <div className="flex items-center justify-between bg-slate-50 p-3.5 rounded-xl border border-slate-200/70">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase block">Status</span>
                  <span
                    className={`text-xs font-extrabold ${
                      selectedBook.available_copies > 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {selectedBook.available_copies > 0 ? 'Available (1 Copy)' : 'Rented Out'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-bold text-slate-400 uppercase block">
                    Reader Rating
                  </span>
                  <span className="text-sm font-extrabold text-amber-500">
                    ★ {selectedBook.rating && selectedBook.rating > 0 ? selectedBook.rating.toFixed(1) : 'No ratings yet'}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                  Synopsis
                </h4>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {selectedBook.description || 'No synopsis available for this title.'}
                </p>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <span className="text-xs font-bold text-slate-700 block mb-2">
                  Rate this book as a reader:
                </span>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setUserRating(star)}
                      className={`text-xl cursor-pointer transition-transform hover:scale-110 ${
                        star <= userRating ? 'text-amber-400' : 'text-slate-300'
                      }`}
                    >
                      ★
                    </button>
                  ))}
                  <button
                    disabled={loading}
                    onClick={() => handleRateBook(selectedBook, userRating)}
                    className="ml-auto px-3.5 py-1.5 text-xs font-bold rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 cursor-pointer"
                  >
                    Submit {userRating}★
                  </button>
                </div>
              </div>

              <button
                disabled={loading || selectedBook.available_copies <= 0}
                onClick={() => {
                  setSelectedBook(null);
                  handleRentClick(selectedBook);
                }}
                className="w-full py-3 rounded-xl text-sm font-extrabold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none transition-all cursor-pointer"
              >
                {selectedBook.available_copies > 0 ? 'Rent This Book' : 'Currently Rented Out'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Book Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-blue-100 rounded-2xl max-w-md w-full p-6 flex flex-col gap-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h2 className="text-base font-extrabold text-blue-700">Add New Book (Single Copy)</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddBook} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700">Book Title *</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Solo Leveling Vol 1"
                  className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">Author / Creator *</label>
                <input
                  type="text"
                  required
                  value={newAuthor}
                  onChange={(e) => setNewAuthor(e.target.value)}
                  placeholder="e.g. Chugong"
                  className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">Genre</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                >
                  {CATEGORIES.filter((c) => c !== 'All').map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">Cover Image URL (Optional)</label>
                <input
                  type="url"
                  value={newCoverUrl}
                  onChange={(e) => setNewCoverUrl(e.target.value)}
                  placeholder="https://example.com/cover.jpg"
                  className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">Description / Synopsis</label>
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Brief summary..."
                  className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                >
                  Publish Book
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}