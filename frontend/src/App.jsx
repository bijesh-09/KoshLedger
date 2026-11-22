import { useEffect } from "react"
import { Navigate, Route, Routes, useLocation } from "react-router-dom"

import { LoginPage, SignupPage } from "@/components/auth"
import { LandingPage } from "@/components/landing/landing-page"
import { ProfilePage } from "@/components/account/profile-page"
import { TransactionsPage } from "@/components/account/transactions-page"
import { FaucetPage } from "@/components/account/faucet-page"
import { TransfersPage } from "@/components/account/transfers-page"
import { AuthPrompt } from "@/components/account/auth-prompt"
import { ServerWakeNotice } from "@/components/server-wake-notice"
import { ProductsPage } from "@/components/products/products-page"
import { ProductViewPage } from "@/components/products/product-view-page"
import { CartPage } from "@/components/products/cart-page"
import { FeaturesWalkthroughPage } from "@/components/pages/features-walkthrough-page"
import { EngineeringBlogPage } from "@/components/pages/engineering-blog-page"

function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" })
  }, [pathname])

  return null
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <ServerWakeNotice />
      <AuthPrompt />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/tx_history" element={<TransactionsPage />} />
        <Route path="/services/faucet" element={<FaucetPage />} />
        <Route path="/services/transfers" element={<TransfersPage />} />
        <Route path="/services/products" element={<ProductsPage />} />
        <Route path="/services/products/view" element={<ProductViewPage />} />
        <Route path="/services/products/cart" element={<CartPage />} />
        <Route
          path="/features_walkthrough"
          element={<FeaturesWalkthroughPage />}
        />
        <Route path="/engineering_blog" element={<EngineeringBlogPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
