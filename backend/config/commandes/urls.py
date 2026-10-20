from django.urls import include
from rest_framework.routers import DefaultRouter
from .views import CommandeViewSet
from .notification_views import NotificationViewSet

router = DefaultRouter()
router.register(r'commandes', CommandeViewSet, basename='commande')
router.register(r'notifications', NotificationViewSet, basename='notification')

urlpatterns = router.urls
