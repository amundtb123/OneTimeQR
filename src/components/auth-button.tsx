import { LogIn, LogOut, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../utils/auth-context';
import { NordicButton } from './nordic-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { toast } from 'sonner@2.0.3';

export function AuthButton() {
  const { t } = useTranslation();
  const { user, signInWithGoogle, signOut } = useAuth();

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Sign in error:', error);
      toast.error(t('common.loginError'));
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success(t('common.logoutSuccess'));
    } catch (error) {
      console.error('Sign out error:', error);
      toast.error(t('common.logoutError'));
    }
  };

  if (!user) {
    return (
      <NordicButton onClick={handleSignIn} variant="ghost" className="text-sm px-3 py-2">
        {t('common.login')}
      </NordicButton>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button 
          className="relative size-8 sm:size-10 rounded-full hover:opacity-80 transition-all hover:ring-2 hover:ring-[#5D8CC9] focus:outline-none focus:ring-2 focus:ring-[#5D8CC9] focus:ring-offset-2 cursor-pointer"
          title={t('common.user')}
          aria-label={t('common.user')}
        >
          <Avatar className="size-8 sm:size-10 ring-2 ring-transparent hover:ring-[#5D8CC9] transition-all">
            <AvatarImage src={user.user_metadata?.avatar_url} alt={user.user_metadata?.name || user.email || ''} />
            <AvatarFallback style={{ backgroundColor: '#5D8CC9', color: '#ffffff' }}>
              {user.user_metadata?.name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        className="w-56 rounded-xl border-[#D5C5BD] bg-white" 
        align="end" 
        forceMount
        style={{ boxShadow: '0 8px 24px rgba(63, 63, 63, 0.12)' }}
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-[#3F3F3F]">{user.user_metadata?.name || t('common.user')}</p>
            <p className="text-[#5B5B5B] text-sm">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator style={{ backgroundColor: '#D5C5BD' }} />
        <DropdownMenuItem 
          onClick={handleSignOut} 
          className="cursor-pointer text-[#3F3F3F] hover:bg-[#E8DCD4] rounded-lg focus:bg-[#E8DCD4]"
        >
          <LogOut className="mr-2 size-4" />
          <span>{t('common.logout')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}