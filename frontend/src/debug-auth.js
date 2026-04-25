// Temporary debugging script - add to browser console
console.log('=== AUTH DEBUG ===');

// Check localStorage
const localStorageUser = localStorage.getItem('user');
console.log('localStorage user:', localStorageUser);
console.log('Parsed localStorage user:', localStorageUser ? JSON.parse(localStorageUser) : null);

// Check Zustand store (if available)
if (window.useAuthStore) {
  const store = window.useAuthStore.getState();
  console.log('Zustand user:', store.user);
  console.log('Zustand isAuthenticated:', store.isAuthenticated);
  console.log('Zustand user.role:', store.user?.role);
} else {
  console.log('Zustand store not accessible from window');
}

// Check current page user object
const userElements = document.querySelectorAll('[data-user-role]');
console.log('User role elements found:', userElements.length);

// Check admin button visibility
const adminButton = document.querySelector('a[href="/admin"], button:contains("Admin")');
if (adminButton) {
  console.log('Admin button found:', adminButton);
  console.log('Admin button visibility:', window.getComputedStyle(adminButton).display);
  console.log('Admin button disabled:', adminButton.disabled);
} else {
  console.log('Admin button NOT found in DOM');
}

console.log('=== END AUTH DEBUG ===');
