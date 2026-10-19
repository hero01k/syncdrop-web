import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Header } from './components/Header';
import { AuthModals } from './components/AuthModals';
import { ProfileModal } from './components/ProfileModal';
import { AdminDeploySection } from './components/AdminDeploySection';
import { CampaignCard } from './components/CampaignCard';
import { FilterToolbar } from './components/FilterToolbar';
import { AdminManageModal } from './components/AdminManageModal';
import { Footer } from './components/Footer';
import { TelegramAlertModal } from './components/TelegramAlertModal';
import {
  Campaign,
  UserAccount,
  FilterStatus,
  CategoryFilter,
} from './types';
import {
  loadCampaigns,
  saveCampaign,
  getActiveUser,
  setActiveUser,
  logoutUser,
  toggleUserCampaignCompletion,
  isEmailAdmin,
  isSuperAdmin,
  getCommunityCount,
  softDeleteCampaign,
  subscribeToCampaigns,
  subscribeToAdminEmails,
  subscribeToCommunityCount,
  subscribeToUser,
  fetchCampaignsFromSupabase,
  getUserOpenedCampaignIds,
  markCampaignTaskOpened,
} from './services/storage';
import { sendCampaignToTelegram } from './services/telegram';
import { FolderPlus, Sparkles, AlertCircle, Lock, ExternalLink, X } from 'lucide-react';

export default function App() {
  // App state
  const [campaigns, setCampaigns] = useState<Campaign[]>(loadCampaigns());
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [openedTaskIds, setOpenedTaskIds] = useState<string[]>([]);
  const [unopenedTaskPromptCampaign, setUnopenedTaskPromptCampaign] = useState<Campaign | null>(null);

  // Target campaign ID from Telegram deep-link (?campaign=camp_...)
  const [highlightedCampaignId, setHighlightedCampaignId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('campaign');
  });
  const hasScrolledToCampaignRef = useRef<string | null>(null);

  // Filters state
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [onlyMyCompleted, setOnlyMyCompleted] = useState<boolean>(false);

  // Modals state
  const [loginOpen, setLoginOpen] = useState<boolean>(false);
  const [signUpOpen, setSignUpOpen] = useState<boolean>(false);
  const [verifyOpen, setVerifyOpen] = useState<boolean>(false);
  const [profileOpen, setProfileOpen] = useState<boolean>(false);
  const [adminManageOpen, setAdminManageOpen] = useState<boolean>(false);
  const [telegramAlertOpen, setTelegramAlertOpen] = useState<boolean>(false);

  // Live Community Count state
  const [communityCount, setCommunityCount] = useState<number>(getCommunityCount());

  // Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info');

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage(message);
    setToastType(type);
    setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  };

  // Initialize data subscriptions on mount (fetching live from Supabase)
  useEffect(() => {
    // Immediate fetch from Supabase
    fetchCampaignsFromSupabase().then((liveCamps) => {
      if (liveCamps && liveCamps.length > 0) {
        setCampaigns(liveCamps);
      }
    });

    // 1. Live Campaigns subscription with Supabase Realtime
    const unsubscribeCampaigns = subscribeToCampaigns((updatedCampaigns) => {
      setCampaigns(updatedCampaigns);
    });

    // 2. Live Admin Emails subscription (only updates role if user is currently logged in)
    const unsubscribeAdmins = subscribeToAdminEmails((_admins) => {
      setCurrentUser((prev) => {
        if (!prev) return null;
        const isSuper = isSuperAdmin(prev.email);
        const isAdm = isEmailAdmin(prev.email);
        const newRole = isSuper ? 'super_admin' : isAdm ? 'admin' : 'user';
        if (prev.role === newRole) return prev;
        return { ...prev, role: newRole };
      });
    });

    // 3. Live Community Count subscription
    const unsubscribeCount = subscribeToCommunityCount((count) => {
      setCommunityCount(count);
    });

    // Active session restore
    const activeUser = getActiveUser();
    setCurrentUser(activeUser);

    // Listen for custom event to trigger verification modal from signup
    const handleVerifyEvent = (_e: any) => {
      setVerifyOpen(true);
    };
    window.addEventListener('open-verify-modal', handleVerifyEvent);

    // Listen for URL changes (popstate)
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const campParam = params.get('campaign');
      if (campParam) {
        hasScrolledToCampaignRef.current = null;
        setHighlightedCampaignId(campParam);
      }
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      unsubscribeCampaigns();
      unsubscribeAdmins();
      unsubscribeCount();
      window.removeEventListener('open-verify-modal', handleVerifyEvent);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Auto-scroll and highlight target campaign card when arriving via Telegram link (?campaign=<id>)
  useEffect(() => {
    if (!highlightedCampaignId) return;
    const targetCamp = campaigns.find((c) => c.id === highlightedCampaignId);
    if (!targetCamp) return;

    if (hasScrolledToCampaignRef.current !== highlightedCampaignId) {
      // Ensure filters don't hide the targeted campaign
      setStatusFilter('all');
      setCategoryFilter('all');
      setSearchQuery('');
      setOnlyMyCompleted(false);

      const scrollTimer = setTimeout(() => {
        const cardEl = document.getElementById(`campaign-${highlightedCampaignId}`);
        if (cardEl) {
          hasScrolledToCampaignRef.current = highlightedCampaignId;
          cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 280);

      // Keep the highlight active for 12 seconds so the user clearly spots the card
      const clearHighlightTimer = setTimeout(() => {
        setHighlightedCampaignId((prev) => (prev === highlightedCampaignId ? null : prev));
      }, 12000);

      return () => {
        clearTimeout(scrollTimer);
        clearTimeout(clearHighlightTimer);
      };
    }
  }, [highlightedCampaignId, campaigns]);

  // Real-time user listener & opened tasks sync when logged in
  useEffect(() => {
    if (!currentUser?.email) {
      setOpenedTaskIds([]);
      return;
    }
    setOpenedTaskIds(getUserOpenedCampaignIds(currentUser.email));
    const unsubscribeUser = subscribeToUser(currentUser.email, (liveUser) => {
      if (liveUser) {
        setCurrentUser((prev) => ({
          ...prev,
          ...liveUser,
        }));
      }
    });
    return () => unsubscribeUser();
  }, [currentUser?.email]);

  // Real-time second-by-second radar ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute admin status
  const isAdmin = useMemo(() => {
    if (!currentUser) return false;
    return (
      currentUser.role === 'super_admin' ||
      currentUser.role === 'admin' ||
      isEmailAdmin(currentUser.email)
    );
  }, [currentUser]);

  // Set of active live campaign IDs
  const activeCampaignIds = useMemo(() => new Set(campaigns.map((c) => c.id)), [campaigns]);

  // Current user's completed campaign IDs (strictly matching active campaigns)
  const userCompletedIds = useMemo(() => {
    if (!currentUser || !currentUser.completedCampaignIds) return [];
    return currentUser.completedCampaignIds.filter((id) => activeCampaignIds.has(id));
  }, [currentUser, activeCampaignIds]);

  // Record when user clicks "Open Link" and visits the external campaign link
  const handleOpenTaskLink = (campaignId: string) => {
    if (highlightedCampaignId === campaignId) {
      setHighlightedCampaignId(null);
    }
    if (!currentUser?.email) return;
    const updated = markCampaignTaskOpened(currentUser.email, campaignId);
    setOpenedTaskIds(updated);
  };

  // Add new campaign (ADMIN ONLY) & broadcast website campaign link to Telegram
  const handleDeployCampaign = async (newCampData: Omit<Campaign, 'id' | 'createdAt'>) => {
    const newCamp: Campaign = {
      ...newCampData,
      id: 'camp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.email,
    };

    try {
      await saveCampaign(newCamp);
      showToast(`Deploying "${newCamp.title}" & notifying Telegram...`, 'info');
    } catch (e: any) {
      showToast(`Database error: ${e?.message || 'Could not save campaign'}`, 'error');
      return;
    }

    // Send notification to Telegram channel via Bot API with our website's campaign link
    const tgResult = await sendCampaignToTelegram({
      id: newCamp.id,
      title: newCamp.title,
      url: newCamp.url || '#',
      tag: newCamp.tag,
      endTime: newCamp.endTime,
      rewardPool: newCamp.rewardPool,
      description: newCamp.description,
    });

    if (tgResult.success) {
      showToast(`🚀 Campaign deployed and posted to Telegram channel (@syncdropofficial)!`, 'success');
    } else {
      showToast(
        `Campaign deployed on radar! (Telegram response: ${tgResult.error || 'Message dispatched'})`,
        'info'
      );
    }
  };

  // Delete campaign (soft deletes into Firestore Recovery Bin)
  const handleDeleteCampaign = async (id: string) => {
    const res = await softDeleteCampaign(id, currentUser?.email);
    if (res.success) {
      if (isSuperAdmin(currentUser?.email)) {
        showToast('Campaign moved to Recovery Bin. You can restore it anytime in Admin Hub.', 'info');
      } else {
        showToast('Campaign removed from community radar.', 'error');
      }
    }
  };

  // User-specific finish handler (Regular user: permanent once Done; Admin: can click Done to return to active)
  const handleToggleFinish = async (campaignId: string) => {
    if (!currentUser) {
      showToast('Please log in or sign up to mark finished tasks for your account!', 'info');
      setLoginOpen(true);
      return;
    }

    const isAlreadyDone = userCompletedIds.includes(campaignId);

    // Regular users: once completed (Done), it cannot be undone!
    if (isAlreadyDone && !isAdmin) {
      return;
    }

    // If marking as Finish (not undoing), verify user has clicked "Open Task" first
    if (!isAlreadyDone) {
      const targetCamp = campaigns.find((c) => c.id === campaignId);
      const hasValidLink = targetCamp && targetCamp.url && targetCamp.url !== '#';

      if (hasValidLink && !openedTaskIds.includes(campaignId)) {
        setUnopenedTaskPromptCampaign(targetCamp);
        return;
      }
    }

    const { isCompleted, updatedList } = await toggleUserCampaignCompletion(
      currentUser.email,
      campaignId,
      isAdmin
    );
    const validUpdated = updatedList.filter((id) => activeCampaignIds.has(id));
    setCurrentUser((prev) => {
      if (!prev) return prev;
      return { ...prev, completedCampaignIds: validUpdated };
    });

    if (isCompleted) {
      showToast(
        isAdmin
          ? '✓ Task marked as Done! (As Admin, click Done anytime to return it to active)'
          : '✓ Task permanently marked as Done for your account!',
        'success'
      );
    } else {
      showToast('↺ Campaign returned to main active list!', 'info');
    }
  };

  // Copy task link
  const handleCopyUrl = (url: string) => {
    if (!url || url === '#') {
      showToast('No active URL attached to this campaign.', 'info');
      return;
    }
    navigator.clipboard.writeText(url);
    showToast('URL copied to clipboard!', 'success');
  };

  // Logout handler
  const handleLogout = () => {
    logoutUser();
    setCurrentUser(null);
    setStatusFilter('all');
    setCategoryFilter('all');
    setOnlyMyCompleted(false);
    showToast('Signed out successfully.', 'info');
  };

  // Quick switch role (Super Admin preview only)
  const handleToggleAdminRole = () => {
    if (!currentUser || !isSuperAdmin(currentUser.email)) return;
    const newRole = currentUser.role === 'super_admin' ? 'user' : 'super_admin';
    const updated: UserAccount = { ...currentUser, role: newRole };
    setActiveUser(updated);
    setCurrentUser(updated);
    showToast(
      `Role preview switched to: ${newRole === 'super_admin' ? 'Super Admin' : 'Regular User'} view.`,
      'info'
    );
  };

  // Counts for status tabs (Ended campaigns stay strictly inside 'Ended', so 'All' reflects live non-ended campaigns)
  const counts = useMemo(() => {
    let active = 0;
    let urgent = 0;
    let ended = 0;

    campaigns.forEach((c) => {
      const remaining = new Date(c.endTime).getTime() - now;
      if (remaining <= 0) {
        ended++;
      } else {
        active++;
        if (remaining <= 24 * 3600 * 1000) {
          urgent++;
        }
      }
    });

    return {
      all: active,
      active,
      urgent,
      ended,
      myCompleted: userCompletedIds.length,
    };
  }, [campaigns, now, userCompletedIds]);

  // Filtered and sorted campaigns
  const filteredCampaigns = useMemo(() => {
    // Sort: Unfinished active campaigns first (by urgency), completed campaigns move to bottom, expired at end
    const sorted = [...campaigns].sort((a, b) => {
      const timeA = new Date(a.endTime).getTime();
      const timeB = new Date(b.endTime).getTime();
      const aExpired = timeA - now <= 0;
      const bExpired = timeB - now <= 0;

      if (aExpired && !bExpired) return 1;
      if (!aExpired && bExpired) return -1;

      const aCompleted = userCompletedIds.includes(a.id);
      const bCompleted = userCompletedIds.includes(b.id);
      if (aCompleted && !bCompleted) return 1;
      if (!aCompleted && bCompleted) return -1;

      return timeA - timeB;
    });

    return sorted.filter((c) => {
      const timeRemaining = new Date(c.endTime).getTime() - now;
      const isExpired = timeRemaining <= 0;
      const isUrgent = timeRemaining > 0 && timeRemaining <= 24 * 3600 * 1000;
      const isFinishedByUser = userCompletedIds.includes(c.id);

      // Only my completed toggle
      if (onlyMyCompleted && !isFinishedByUser) {
        return false;
      }

      // Ended campaigns stay strictly inside the 'Ended' tab (unless viewing a specific deep-linked campaign)
      if (statusFilter === 'ended') {
        if (!isExpired) return false;
      } else {
        if (isExpired && c.id !== highlightedCampaignId) return false;
        if (statusFilter === 'urgent' && !isUrgent) return false;
      }

      // Category filter
      if (categoryFilter !== 'all' && c.tag !== categoryFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesTitle = c.title.toLowerCase().includes(query);
        const matchesTag = c.tag.toLowerCase().includes(query);
        const matchesDesc = c.description?.toLowerCase().includes(query) || false;
        if (!matchesTitle && !matchesTag && !matchesDesc) return false;
      }

      return true;
    });
  }, [
    campaigns,
    now,
    userCompletedIds,
    statusFilter,
    categoryFilter,
    searchQuery,
    onlyMyCompleted,
    highlightedCampaignId,
  ]);

  return (
    <div className="min-h-screen flex flex-col font-sans selection:bg-indigo-500 selection:text-white relative overflow-x-clip">
      {/* Top Header */}
      <Header
        currentUser={currentUser}
        onOpenLogin={() => setLoginOpen(true)}
        onOpenSignUp={() => setSignUpOpen(true)}
        onOpenProfile={() => setProfileOpen(true)}
        onOpenAdminManager={() => setAdminManageOpen(true)}
        onOpenTelegramAlert={() => setTelegramAlertOpen(true)}
        isAdmin={isAdmin}
        totalCampaigns={campaigns.length}
        communityCount={communityCount}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-7 relative z-10">

        {/* Admin Deploy Section: ONLY rendered if user has Admin privileges! */}
        {isAdmin ? (
          <div className="animate-fade-up">
            <AdminDeploySection onDeploy={handleDeployCampaign} isAdmin={isAdmin} />
          </div>
        ) : (
          /* Subtle guest/user banner guiding community members (hidden on mobile to save vertical space) */
          !currentUser && (
            <div className="animate-fade-up hidden sm:flex px-5 py-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs flex-col sm:flex-row items-start sm:items-center justify-between text-xs gap-3">
              <div className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300">
                <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 animate-pulse" />
                <span>
                  Welcome to <strong className="text-zinc-950 dark:text-white">SYNC DROP</strong>. Sign up to monitor live countdowns and track your completed tasks individually.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setSignUpOpen(true)}
                  className="px-4 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 font-mono font-bold text-xs transition-all duration-200 hover:-translate-y-0.5 active:scale-95 cursor-pointer"
                >
                  Create Free Account
                </button>
              </div>
            </div>
          )
        )}

        {/* Navigation, Filters & Search */}
        <div className="animate-fade-up" style={{ animationDelay: '40ms' }}>
          <FilterToolbar
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            categoryFilter={categoryFilter}
            onCategoryChange={setCategoryFilter}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            counts={counts}
            onlyMyCompleted={onlyMyCompleted}
            onToggleOnlyMyCompleted={() => setOnlyMyCompleted(!onlyMyCompleted)}
            isLoggedIn={!!currentUser}
            onPromptLogin={() => {
              setLoginOpen(true);
              showToast('Please log in to unlock filters and task participation!', 'info');
            }}
          />
        </div>

        {/* Campaigns Grid */}
        {filteredCampaigns.length > 0 ? (
          <div className="space-y-4 md:space-y-6">
            {/* Top visible campaigns (Max 3 when logged out, all when logged in; always includes highlighted campaign from Telegram) */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {(() => {
                if (currentUser) return filteredCampaigns;
                const topThree = filteredCampaigns.slice(0, 3);
                if (
                  highlightedCampaignId &&
                  !topThree.some((c) => c.id === highlightedCampaignId)
                ) {
                  const target = filteredCampaigns.find((c) => c.id === highlightedCampaignId);
                  if (target) {
                    return [target, ...topThree.slice(0, 2)];
                  }
                }
                return topThree;
              })().map((camp, idx) => (
                <CampaignCard
                  key={camp.id}
                  index={idx}
                  campaign={camp}
                  now={now}
                  isUserCompleted={userCompletedIds.includes(camp.id)}
                  hasOpenedTask={openedTaskIds.includes(camp.id)}
                  isHighlighted={highlightedCampaignId === camp.id}
                  isAdmin={isAdmin}
                  onToggleFinish={handleToggleFinish}
                  onOpenTaskLink={handleOpenTaskLink}
                  onDeleteCampaign={isAdmin ? handleDeleteCampaign : undefined}
                  onCopyUrl={handleCopyUrl}
                  isLoggedIn={!!currentUser}
                  onPromptLogin={() => {
                    setLoginOpen(true);
                    showToast('Please log in to unlock task links and participation!', 'info');
                  }}
                />
              ))}
            </section>

            {/* Blurred remaining campaigns when guest / logged out */}
            {!currentUser && filteredCampaigns.length > 3 && (
              <div className="relative mt-2 md:mt-8 max-h-[340px] md:max-h-none rounded-3xl overflow-hidden p-1 animate-fade-up">
                {/* Blurred backdrop cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 filter blur-md opacity-35 select-none pointer-events-none">
                  {filteredCampaigns
                    .slice(3)
                    .filter((c) => c.id !== highlightedCampaignId)
                    .map((camp, idx) => (
                      <CampaignCard
                        key={camp.id}
                        index={idx}
                        campaign={camp}
                        now={now}
                        isUserCompleted={false}
                        isAdmin={false}
                        onToggleFinish={() => {}}
                        onCopyUrl={() => {}}
                        isLoggedIn={false}
                      />
                    ))}
                </div>

                {/* Floating Unlock Banner: Positioned near top on mobile (< md) so users see it immediately upon scrolling, centered on desktop */}
                <div className="absolute inset-0 flex items-start md:items-center justify-center pt-2 px-3 pb-4 md:p-4 z-20">
                  <div className="animate-modal-pop bg-white/95 dark:bg-[#0F0F13]/95 rounded-3xl p-6 sm:p-9 border border-zinc-300 dark:border-zinc-800 text-center max-w-lg w-full shadow-2xl backdrop-blur-2xl space-y-3.5 sm:space-y-4">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto rounded-2xl bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800/70 flex items-center justify-center text-indigo-600 dark:text-indigo-400 animate-float">
                      <Lock className="w-6 h-6 sm:w-7 sm:h-7" />
                    </div>
                    <div>
                      <h3 className="text-lg sm:text-2xl font-extrabold text-zinc-950 dark:text-white font-display tracking-tight">
                        Unlock All Radar Campaigns
                      </h3>
                      <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 mt-1.5 max-w-sm mx-auto font-sans leading-relaxed">
                        Log in or sign up with your email to reveal all {filteredCampaigns.length} campaigns, open direct task links, unlock category filters, and track personal completions.
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-3 pt-1 sm:pt-2 font-mono">
                      <button
                        onClick={() => setLoginOpen(true)}
                        className="px-5 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white border border-zinc-300 dark:border-zinc-700 text-xs font-bold transition-all duration-200 hover:-translate-y-0.5 active:scale-95 font-mono cursor-pointer"
                      >
                        Log In
                      </button>
                      <button
                        onClick={() => setSignUpOpen(true)}
                        className="px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 text-xs font-bold shadow-md transition-all duration-200 hover:-translate-y-0.5 active:scale-95 font-mono cursor-pointer"
                      >
                        Sign Up Free
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Empty State */
          <div className="animate-fade-up text-center py-20 px-4 glass-card rounded-3xl border-dashed">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-4 border border-indigo-200 dark:border-indigo-800/70 animate-float">
              <FolderPlus className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-extrabold text-zinc-950 dark:text-white mb-1 font-display">
              No Matching Campaigns Found
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-sm mx-auto">
              {onlyMyCompleted
                ? "You haven't marked any campaigns as completed yet. Click 'Finish' on active tasks to track them."
                : 'Try adjusting your category filter, status tab, or search query to view active radar items.'}
            </p>
          </div>
        )}
      </main>

      {/* Modern Footer with Socials (Twitter, Telegram, Discord, GitHub) & Project Navigation */}
      <Footer
        onFilterStatus={(status) => setStatusFilter(status)}
        onFilterCategory={(category) => setCategoryFilter(category)}
        onOpenTelegramAlert={() => setTelegramAlertOpen(true)}
        onShowToast={showToast}
      />

      {/* Auth Modals: Login, SignUp, Verification */}
      <AuthModals
        loginOpen={loginOpen}
        signUpOpen={signUpOpen}
        verifyOpen={verifyOpen}
        onClose={() => {
          setLoginOpen(false);
          setSignUpOpen(false);
          setVerifyOpen(false);
        }}
        onOpenLogin={() => {
          setSignUpOpen(false);
          setVerifyOpen(false);
          setLoginOpen(true);
        }}
        onOpenSignUp={() => {
          setLoginOpen(false);
          setVerifyOpen(false);
          setSignUpOpen(true);
        }}
        onAuthSuccess={(user) => {
          setCurrentUser(user);
          setCommunityCount(getCommunityCount());
          showToast(`Welcome back, ${user.email}!`, 'success');
        }}
      />

      {/* Profile Modal */}
      {currentUser && (
        <ProfileModal
          isOpen={profileOpen}
          onClose={() => setProfileOpen(false)}
          currentUser={currentUser}
          onLogout={handleLogout}
          completedCount={userCompletedIds.length}
          totalCampaigns={campaigns.length}
          onToggleAdminRole={handleToggleAdminRole}
          onOpenTelegramAlert={() => setTelegramAlertOpen(true)}
          onOpenAdminManager={() => setAdminManageOpen(true)}
        />
      )}

      {/* Telegram Campaign Alerts Modal */}
      <TelegramAlertModal
        isOpen={telegramAlertOpen}
        onClose={() => setTelegramAlertOpen(false)}
        latestCampaign={campaigns[0]}
      />

      {/* Admin Authorization & Recovery Modal */}
      <AdminManageModal
        isOpen={adminManageOpen}
        onClose={() => setAdminManageOpen(false)}
        currentUserEmail={currentUser?.email}
        onAdminsUpdated={() => {
          // Re-evaluate admin status
          if (currentUser) {
            const hasAdmin = isEmailAdmin(currentUser.email);
            setCurrentUser({ ...currentUser, role: hasAdmin ? 'admin' : currentUser.role });
          }
        }}
        onCampaignRestored={() => {
          setCampaigns(loadCampaigns());
          showToast('Campaign successfully restored to live radar!', 'success');
        }}
        onCampaignPermanentlyDeleted={(title) => {
          showToast(
            title
              ? `Campaign "${title}" permanently deleted from database.`
              : 'Campaign permanently deleted from database.',
            'error'
          );
        }}
      />

      {/* Popup Alert Modal when user clicks "Finish" before clicking "Open Link" */}
      {unopenedTaskPromptCampaign && (
        <div className="animate-backdrop-fade fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="animate-modal-pop bg-white dark:bg-[#0F0F13] text-zinc-950 dark:text-white rounded-3xl max-w-sm w-full p-6 border border-zinc-200 dark:border-zinc-800 space-y-4 shadow-2xl relative text-center">
            <button
              onClick={() => setUnopenedTaskPromptCampaign(null)}
              aria-label="Close"
              className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/70 flex items-center justify-center text-amber-600 dark:text-amber-400 animate-float">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base sm:text-lg font-extrabold text-zinc-950 dark:text-white font-display">
                Open Task Link First!
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                You haven't clicked <strong className="text-zinc-950 dark:text-white">Open Link</strong> for{' '}
                <strong className="text-indigo-600 dark:text-indigo-400">{unopenedTaskPromptCampaign.title}</strong> yet. Please click the task link and visit the campaign page first before marking it as finished.
              </p>
            </div>

            <div className="flex items-center gap-2.5 pt-1 font-mono text-xs">
              <button
                type="button"
                onClick={() => setUnopenedTaskPromptCampaign(null)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-800 font-bold transition-all duration-200 hover:-translate-y-0.5 active:scale-95 cursor-pointer"
              >
                Close
              </button>
              <a
                href={unopenedTaskPromptCampaign.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  handleOpenTaskLink(unopenedTaskPromptCampaign.id);
                  setUnopenedTaskPromptCampaign(null);
                }}
                className="flex-1 py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 font-bold flex items-center justify-center gap-1.5 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 shadow-xs"
              >
                <span>Open Link</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Pill */}
      {toastMessage && (
        <div
          className={`animate-toast-in fixed bottom-6 right-6 z-50 transition-all duration-300 px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-bold font-mono ${
            toastType === 'success'
              ? 'bg-emerald-600 text-white border border-emerald-500'
              : toastType === 'error'
              ? 'bg-rose-600 text-white border border-rose-500'
              : 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 border border-zinc-700 dark:border-zinc-300'
          }`}
        >
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
