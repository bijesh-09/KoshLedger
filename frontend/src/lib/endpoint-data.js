/**
 * Catalogue of the backend endpoints, grouped for the profile page.
 * `live: true` means the UI actually calls it today. Everything else is a
 * labelled placeholder for a page that will be built later.
 */
export const endpointGroups = [
  {
    title: "Authentication",
    items: [
      {
        method: "POST",
        path: "/auth/register",
        description: "Create a user and a zero-balance wallet.",
      },
      {
        method: "POST",
        path: "/auth/login",
        description: "Exchange username + password for a 30-minute JWT.",
      },
    ],
  },
  {
    title: "Account",
    items: [
      {
        method: "GET",
        path: "/users/me",
        description: "Profile, wallet balance and favourites.",
        live: true,
      },
      {
        method: "GET",
        path: "/users",
        description: "List active users for transfer recipients.",
      },
      {
        method: "GET",
        path: "/users/me/transactions",
        description: "Completed transaction history, newest first.",
      },
      {
        method: "PATCH",
        path: "/users/me/change_username",
        description: "Rename the signed-in account.",
      },
      {
        method: "POST",
        path: "/users/me/deactivate",
        description: "Temporarily deactivate the account.",
      },
      {
        method: "POST",
        path: "/users/me/activate",
        description: "Reactivate a deactivated account.",
      },
      {
        method: "DELETE",
        path: "/users/me/delete",
        description: "Soft-delete with a 30-day recovery window.",
      },
      {
        method: "POST",
        path: "/users/me/recover",
        description: "Recover an account that is pending deletion.",
      },
    ],
  },
  {
    title: "Products",
    items: [
      {
        method: "GET",
        path: "/products",
        description: "Public catalog of seeded products.",
      },
      {
        method: "POST",
        path: "/products/choose_favourite/{id}",
        description: "Add a product to your favourites.",
      },
      {
        method: "DELETE",
        path: "/products/remove_favourite/{id}",
        description: "Remove a favourite.",
      },
    ],
  },
  {
    title: "Money movement",
    items: [
      {
        method: "POST",
        path: "/faucet",
        description: "Claim simulated money (Idempotency-Key).",
      },
      {
        method: "POST",
        path: "/purchases",
        description: "Buy products atomically (Idempotency-Key).",
      },
      {
        method: "POST",
        path: "/transfers",
        description: "Send money to another user (Idempotency-Key).",
      },
    ],
  },
]
