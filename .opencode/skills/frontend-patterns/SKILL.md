---
name: frontend-patterns
description: Advanced frontend patterns for React 19, Next.js 16 App Router, ShadCN/ui, Tailwind CSS, and Supabase. Includes component architecture, state management, performance optimization, forms, and accessibility.
license: MIT
compatibility: opencode
metadata:
  stack: react-nextjs-shadcn-supabase
  audience: frontend-developers
---

# Frontend Patterns Skill

Load this skill when working on complex frontend tasks requiring advanced patterns for React 19, Next.js 16, ShadCN/ui, Tailwind CSS, and Supabase.

## Stack Overview

- **React 19** with Server Components (RSC) by default
- **Next.js 16** App Router with file-based routing
- **TypeScript** strict mode
- **ShadCN/ui** new-york style
- **Tailwind CSS** with CSS variables
- **Supabase** for data operations
- **Zod** for validation
- **Lucide React** for icons

## Component Architecture Patterns

### Compound Components with ShadCN

Use compound components for complex UI with shared state:

```tsx
// components/tabs/tabs.tsx
'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs() {
  const context = useContext(TabsContext);
  if (!context) throw new Error('useTabs must be used within Tabs');
  return context;
}

interface TabsProps {
  defaultValue: string;
  children: ReactNode;
  className?: string;
}

export function Tabs({ defaultValue, children, className }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultValue);
  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={cn("w-full", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex gap-1 border-b", className)} role="tablist">
      {children}
    </div>
  );
}

interface TabsTriggerProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function TabsTrigger({ value, children, className }: TabsTriggerProps) {
  const { activeTab, setActiveTab } = useTabs();
  const isActive = activeTab === value;
  
  return (
    <button
      role="tab"
      aria-selected={isActive}
      className={cn(
        "px-4 py-2 text-sm font-medium transition-colors",
        isActive 
          ? "border-b-2 border-primary text-primary" 
          : "text-muted-foreground hover:text-foreground",
        className
      )}
      onClick={() => setActiveTab(value)}
    >
      {children}
    </button>
  );
}

interface TabsContentProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function TabsContent({ value, children, className }: TabsContentProps) {
  const { activeTab } = useTabs();
  if (activeTab !== value) return null;
  return <div role="tabpanel" className={cn("pt-4", className)}>{children}</div>;
}
```

### Render Props Pattern

For flexible component composition:

```tsx
interface DataLoaderProps<T> {
  fetcher: () => Promise<T>;
  children: (data: T) => ReactNode;
  loading?: ReactNode;
  error?: (error: Error) => ReactNode;
}

export function DataLoader<T>({ 
  fetcher, 
  children, 
  loading = <Skeleton className="h-20" />,
  error = (e) => <Alert variant="destructive">{e.message}</Alert>
}: DataLoaderProps<T>) {
  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: Error | null;
  }>({ data: null, loading: true, error: null });

  useEffect(() => {
    fetcher()
      .then(data => setState({ data, loading: false, error: null }))
      .catch(err => setState({ data: null, loading: false, error: err }));
  }, [fetcher]);

  if (state.loading) return loading;
  if (state.error) return error(state.error);
  if (state.data) return children(state.data);
  return null;
}
```

## State Management Patterns

### Optimistic Updates with React 19

```tsx
'use client';

import { useOptimistic, useTransition } from 'react';
import { updateItem } from '@/lib/actions/items';
import { Checkbox } from '@/components/ui/checkbox';

interface Item {
  id: string;
  title: string;
  completed: boolean;
}

export function TodoList({ items }: { items: Item[] }) {
  const [optimisticItems, addOptimisticItem] = useOptimistic(
    items,
    (state, update: { id: string; completed: boolean }) =>
      state.map(item =>
        item.id === update.id ? { ...item, completed: update.completed } : item
      )
  );
  const [isPending, startTransition] = useTransition();

  async function toggleComplete(id: string, completed: boolean) {
    startTransition(async () => {
      addOptimisticItem({ id, completed });
      await updateItem(id, { completed });
    });
  }

  return (
    <ul className="space-y-2">
      {optimisticItems.map(item => (
        <li key={item.id} className={cn("flex items-center gap-2", isPending && "opacity-70")}>
          <Checkbox
            checked={item.completed}
            onCheckedChange={(checked) => toggleComplete(item.id, !!checked)}
          />
          <span className={item.completed ? "line-through text-muted-foreground" : ""}>
            {item.title}
          </span>
        </li>
      ))}
    </ul>
  );
}
```

### URL State Management

Keep UI state in URL for shareability:

```tsx
'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function useQueryState(key: string, defaultValue: string = '') {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const value = searchParams.get(key) ?? defaultValue;

  const setValue = useCallback(
    (newValue: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (newValue === defaultValue) {
        params.delete(key);
      } else {
        params.set(key, newValue);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [key, defaultValue, searchParams, pathname, router]
  );

  return [value, setValue] as const;
}

// Usage example
function FilterComponent() {
  const [status, setStatus] = useQueryState('status', 'all');
  
  return (
    <Select value={status} onValueChange={setStatus}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Statut" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Tous</SelectItem>
        <SelectItem value="active">Actif</SelectItem>
        <SelectItem value="completed">Termine</SelectItem>
      </SelectContent>
    </Select>
  );
}
```

### Form State with useFormStatus

```tsx
'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {pending ? 'Envoi...' : children}
    </Button>
  );
}

// Usage in form
<form action={serverAction}>
  <Input name="email" />
  <SubmitButton>Soumettre</SubmitButton>
</form>
```

## Data Fetching Patterns

### Parallel Data Loading with Suspense

```tsx
// app/dashboard/page.tsx
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

async function UserStats() {
  const stats = await fetchUserStats();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Statistiques</CardTitle>
      </CardHeader>
      <CardContent>
        <StatsDisplay data={stats} />
      </CardContent>
    </Card>
  );
}

async function RecentActivity() {
  const activity = await fetchRecentActivity();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activite recente</CardTitle>
      </CardHeader>
      <CardContent>
        <ActivityList items={activity} />
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Suspense fallback={<Skeleton className="h-40" />}>
        <UserStats />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-40" />}>
        <RecentActivity />
      </Suspense>
    </div>
  );
}
```

### Infinite Scroll with Supabase

```tsx
'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';

const PAGE_SIZE = 20;

export function useIntersectionObserver(
  ref: React.RefObject<Element>,
  callback: () => void,
  options?: IntersectionObserverInit
) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) callback();
    }, options);

    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, callback, options]);
}

export function InfiniteList() {
  const [items, setItems] = useState<Item[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const offsetRef = useRef(0);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offsetRef.current, offsetRef.current + PAGE_SIZE - 1);

    if (data) {
      setItems(prev => [...prev, ...data]);
      offsetRef.current += data.length;
      setHasMore(data.length === PAGE_SIZE);
    }
    setLoading(false);
  }, [loading, hasMore]);

  useIntersectionObserver(loadMoreRef, loadMore, { rootMargin: '100px' });

  useEffect(() => { loadMore(); }, []);

  return (
    <>
      <ul className="space-y-2">
        {items.map(item => <ItemCard key={item.id} item={item} />)}
      </ul>
      <div ref={loadMoreRef} className="h-10 flex items-center justify-center">
        {loading && <Loader2 className="h-6 w-6 animate-spin" />}
      </div>
    </>
  );
}
```

### Real-time Subscriptions

```tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useRealtimeTable<T extends { id: string }>(
  table: string,
  initialData: T[]
) {
  const [data, setData] = useState<T[]>(initialData);

  useEffect(() => {
    const supabase = createClient();
    
    const channel = supabase
      .channel(`${table}-changes`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setData(prev => [payload.new as T, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setData(prev => prev.map(item => 
              item.id === (payload.new as T).id ? payload.new as T : item
            ));
          } else if (payload.eventType === 'DELETE') {
            setData(prev => prev.filter(item => item.id !== (payload.old as T).id));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [table]);

  return data;
}

// Usage
function TaskList({ initialTasks }: { initialTasks: Task[] }) {
  const tasks = useRealtimeTable('tasks', initialTasks);
  
  return (
    <ul>
      {tasks.map(task => <TaskItem key={task.id} task={task} />)}
    </ul>
  );
}
```

## Form Handling with react-hook-form + Zod

```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { createTask } from '@/lib/actions/tasks';
import { toast } from 'sonner';

const taskSchema = z.object({
  title: z.string()
    .min(5, "Le titre doit contenir au moins 5 caracteres")
    .max(100, "Le titre ne peut pas depasser 100 caracteres"),
  description: z.string()
    .min(10, "La description doit contenir au moins 10 caracteres")
    .max(1000, "La description ne peut pas depasser 1000 caracteres"),
  dueDate: z.string().optional(),
});

type TaskFormData = z.infer<typeof taskSchema>;

export function TaskForm({ onSuccess }: { onSuccess?: () => void }) {
  const form = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: '',
      description: '',
      dueDate: '',
    },
  });

  async function onSubmit(data: TaskFormData) {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value) formData.append(key, value);
    });

    const result = await createTask(formData);
    
    if (result.error) {
      toast.error(result.error);
      return;
    }
    
    toast.success('Tache creee avec succes');
    form.reset();
    onSuccess?.();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Titre</FormLabel>
              <FormControl>
                <Input placeholder="Entrez le titre de la tache" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Decrivez la tache en detail"
                  className="min-h-[100px]"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Fournissez une description claire de la tache.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="dueDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date limite (optionnel)</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Creation...' : 'Creer la tache'}
        </Button>
      </form>
    </Form>
  );
}
```

## Performance Patterns

### Virtualized Lists with @tanstack/react-virtual

For large lists, use virtualization:

```tsx
'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';

export function VirtualList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="h-[400px] overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map(virtualItem => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <ItemRow item={items[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Debounced Search

```tsx
// hooks/use-debounce.ts
import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Usage in search component
'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';

interface SearchInputProps {
  onSearch: (query: string) => void;
  placeholder?: string;
}

export function SearchInput({ onSearch, placeholder = "Rechercher..." }: SearchInputProps) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    onSearch(debouncedQuery);
  }, [debouncedQuery, onSearch]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="pl-9"
      />
    </div>
  );
}
```

## Accessibility Patterns

### Focus Management for Modals

```tsx
'use client';

import { useEffect, useRef, ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title: string;
  className?: string;
}

export function Modal({ isOpen, onClose, children, title, className }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<Element | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement;
      dialogRef.current?.focus();
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      (previousActiveElement.current as HTMLElement)?.focus();
    }
    
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Trap focus within modal
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    
    if (e.key === 'Tab') {
      const focusableElements = dialogRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusableElements?.length) return;

      const first = focusableElements[0] as HTMLElement;
      const last = focusableElements[focusableElements.length - 1] as HTMLElement;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div 
        className="fixed inset-0 bg-black/50" 
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className={cn(
          "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
          "bg-background p-6 rounded-lg shadow-lg",
          "w-full max-w-md max-h-[85vh] overflow-auto",
          className
        )}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="modal-title" className="text-lg font-semibold">{title}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

### Screen Reader Announcements

```tsx
'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

const AnnouncerContext = createContext<(message: string) => void>(() => {});

export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');

  const announce = useCallback((msg: string) => {
    setMessage('');
    requestAnimationFrame(() => setMessage(msg));
  }, []);

  return (
    <AnnouncerContext.Provider value={announce}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {message}
      </div>
    </AnnouncerContext.Provider>
  );
}

export const useAnnounce = () => useContext(AnnouncerContext);

// Usage
function DeleteButton({ onDelete }: { onDelete: () => Promise<void> }) {
  const announce = useAnnounce();
  
  async function handleDelete() {
    await onDelete();
    announce('Element supprime avec succes');
  }

  return <Button onClick={handleDelete} variant="destructive">Supprimer</Button>;
}
```

## Animation Patterns with Tailwind

### Entrance Animations

```tsx
// Use CSS animations via Tailwind
<div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
  Content
</div>

// Exit animations
<div className="animate-out fade-out slide-out-to-top-4 duration-200">
  Content
</div>
```

### Staggered List Animation

```tsx
export function StaggeredList({ items }: { items: Item[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li
          key={item.id}
          className="animate-in fade-in slide-in-from-left-4"
          style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
        >
          <ItemCard item={item} />
        </li>
      ))}
    </ul>
  );
}
```

## Error Handling Patterns

### Error Boundary with Reset

```tsx
// app/[feature]/error.tsx
'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8">
      <AlertCircle className="h-12 w-12 text-destructive" />
      <h2 className="text-xl font-semibold">Une erreur est survenue</h2>
      <p className="text-muted-foreground text-center max-w-md">
        {error.message || "Quelque chose s'est mal passe. Veuillez reessayer."}
      </p>
      <Button onClick={reset}>Reessayer</Button>
    </div>
  );
}
```

### Loading States

```tsx
// app/[feature]/loading.tsx
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-[250px]" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-3/4" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

## When to Use This Skill

- Building complex interactive components
- Implementing data tables with sorting/filtering/pagination
- Creating forms with complex validation
- Optimizing performance for large datasets
- Adding accessibility features
- Implementing animations and transitions
- Managing complex state across components
- Setting up real-time data subscriptions
- Building infinite scroll or virtualized lists
